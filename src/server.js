import util from 'util';

import http from 'http';
import https from 'https';

import koa from 'koa';
import auth from 'koa-basic-auth';
import bodyparser from 'koa-bodyparser';
import handlebars from 'koa-handlebars';
import mount from 'koa-mount';
import route from 'koa-route';

import mailer from 'nodemailer';

import _ from 'lodash';

const analysis = {
  number: 1,
  title: 'Patches are AMAZING!',
  abstract: 'Patches of vegetation are so cool. But no one really studies them. Until now! We propose to analyze patches of vegetation in the best way possible. Please let us use your data to do it.',
  emailSubject: '!TEST! New Converge/Diverge Opt-In Analysis !TEST!',
  organizers: [{
    name: 'Kevin Wilcox',
    email: 'kevin@kevin.com'
  },{
    name: 'Sally Koerner',
    email: 'sally@sally.com'
  },{
    name: 'Emily Grman',
    email: 'emily@emily.com'
  }]
};

module.exports = {
  start
};

function start(config, database, data) {
  const server = koa(),
        adminServer = koa();

  const routes = {
    consentStatus,
    consentSendGet,
    consentSendPost,
    consentForm,
    updateConsent
  };

  adminServer.use(function *(next){
    try {
      yield next;
    } catch (err) {
      if (401 == err.status) {
        this.status = 401;
        this.set('WWW-Authenticate', 'Basic');
        this.body = 'Unauthorized';
      } else {
        throw err;
      }
    }
  });

  adminServer.use(mount('/admin', auth({name: 'k', pass: 'k'})));

  adminServer.use(bodyparser());
  adminServer.use(handlebars({cache: false}));

  adminServer.use(route.get('/admin/status', routes.consentStatus));
  adminServer.use(route.get('/admin/send', routes.consentSendGet));
  adminServer.use(route.post('/admin/send', routes.consentSendPost));


  server.use(bodyparser());
  server.use(handlebars({cache: false}));
  server.use(route.get('/consent/form/:personID', routes.consentForm));
  server.use(route.post('/consent/update/:analysisNumber/:personID', routes.updateConsent));

  const {ports, cert, key} = config;

  http.createServer(server.callback()).listen(ports.http);
  https.createServer({ca:[], cert, key}, adminServer.callback()).listen(ports.https);

  console.log('HTTP server is listening on port', ports.http);
  console.log('HTTPS server is listening on port', ports.https);

  function *consentStatus() {
    const projects = _.flatten(_.map(database, (person, personID) => {
      return _.map(person.projects, project => {
        return project;
      });
    }));

    yield this.render('consentStatus', {projects});
  }

  function *consentSendGet() {
    const projects = _.flatten(_.map(database, (person, personID) => {
      return _.map(person.projects, project => {
        return project;
      });
    }));

    yield this.render('consentSend', {projects});
  }

  function *consentSendPost() {
    console.log(this.request.body);
    const {request} = this,
          {body} = request;

    const projects = _.filter(_.map(body, (on, projectID) => {
      return on === 'on' ? getProject(projectID) : undefined;
    }), project => {
      return project !== undefined;
    });

    const emails = _.map(_.groupBy(projects, 'personID'), (projects, personID) => {
      return {
        person: getPerson(personID),
        projects
      };
    });

    // const persons = _.unique(_.map(projects, projectID => {
    //   const project = getProject(projectID),
    //         {personID} = project,
    //         {email} = getPerson(personID);

    //   return {personID, projectID, email};
    // }), 'personID');


    const names = _.pluck(analysis.organizers, 'name'),
          {host} = config;

    for (let i = 0; i < emails.length; i++) {
      const emailRecord = emails[i],
            {person} = emailRecord,
            {personID} = person;

      emailRecord.emailText = yield this.renderView('consentEmail', {
        organizers: names.join(', '),
        organizersWithAnd: makeAndText(names),
        link: `http://${host}/consent/form/${personID}`,
        title: analysis.title,
        abstract: analysis.abstract
      });
    }

    this.body = sendEmails(emails);

    function sendEmails(emails) {
      const {email, password} = body;

      if (!email || !password) {
        return 'No email or password!';
      }

      const transporter = mailer.createTransport({
        service: 'gmail',
        secure: true,
        auth: {
          user: email,
          pass: password
        }
      });

      _.each(emails, sendEmail);

      return 'sent! (maybe)';

      function sendEmail(emailRecord) {
        console.log('sending email to', emailRecord);

        const {person, projects} = emailRecord;

        const options = {
          from: email,
          to: person.email,
          subject: analysis.emailSubject,
          text: emailRecord.emailText
        };

        transporter.sendMail(options, (error, info) => {
          if (error) {
            console.log('Error sending mail', options, error);
          }
          const project = getProject(person.projectID);

          _.each(projects, project => {
            project.status.emailSent = true;
          });

          data.save(database);
          console.log('Email sent!', options,  info);
        });
      }
    }

    function makeAndText(names) {
      const {length} = names;

      if (length === 0) return '';
      else if (length === 1) return names[0];
      else if (length === 2) return names[0] + ' and ' + names[1];
      else {
        let text = names[0];

        for (let i = 1; i < length - 1; i++) {
          text += ', ' + names[i];
        }

        text += ', and ' + names[length - 1];

        return text;
      }
    }
  }

  function *consentForm(personID) {
    const person = getPerson(personID);

    if (!person) return;

    yield this.render('consentForm', {person, analysis});
  }

  function *updateConsent(analysisNumber, personID) {
    const {request} = this,
          {body} = request;

    const projectCount = _.keys(body).length;

    const projects = _.mapValues(body, (doConsent, projectID) => {
      const project = getProject(projectID);

      if (!project) throw Error('No project with projectID', projectID);

      return project;
    });

    _.each(projects, (project, projectID) => {
      const doesConsent = body[projectID] === 'yes',
            {status} = project;

      status.respondedAt = new Date();

      status.hasResponded = true;
      status.hasConsented = doesConsent;
    });


    data.save(database, err => {
      if (err) throw new Error('Submission failed. Please contact Administrator.');
    });

    yield this.render('thanks', {projects, analysis, personID});
  }

  function getPerson(personID) {
    return database[personID];
  }

  function getProject(projectID) {
    let p;
    _.each(database, (person, personID) => {
      _.each(person.projects, project => {
        if (project.projectID === projectID) p = project;
      });
    });
    return p;
  }
}
