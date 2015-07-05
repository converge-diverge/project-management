import util from 'util';

import http from 'http';
import https from 'https';

import constructStacks from 'koa-stacks';
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
  const {adminName, adminPass} = config;

  const stacks = {
    admin: {
      authorization: {
        type: 'basic',
        name: adminName,
        pass: adminPass
      },
      middleware: [
        bodyparser(),
        handlebars({cache: false})
      ],
      routes: {
        '/admin': {
          routes: {
            '/status': {
              methods: {
                'get': getStatus
              }
            },
            '/send': {
              methods: {
                'get': getSend,
                'post': postSend
              }
            }
          }
        }
      }
    },
    consent: {
      middleware: [
        bodyparser(),
        handlebars({cache: false})
      ],
      routes: {
        '/consent': {
          routes: {
            '/form/:personID': {
              methods: {
                'get': getForm
              }
            },
            '/update/:analysisNumber/:personID': {
              methods: {
                'post': postUpdate
              }
            }
          }
        }
      }
    }
  };

  const {
    admin,
    consent
  } = constructStacks(stacks, console.log);

  const {ports, cert, key} = config;

  http.createServer(consent.callback()).listen(ports.http);
  https.createServer({ca:[], cert, key}, admin.callback()).listen(ports.https);

  console.log('consent stack is running an HTTP server on port', ports.http);
  console.log('admin stack is running an HTTPS server on port', ports.https);


  function *getStatus() {
    const projects = _.flatten(_.map(database, (person, personID) => {
      return _.map(person.projects, project => {
        return project;
      });
    }));

    yield this.render('consentStatus', {projects});
  }

  function *getSend() {
    const projects = _.flatten(_.map(database, (person, personID) => {
      return _.map(person.projects, project => {
        return project;
      });
    }));

    yield this.render('consentSend', {projects});
  }

  function *postSend() {
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

  function *getForm(personID) {
    const person = getPerson(personID);

    if (!person) return;

    yield this.render('consentForm', {person, analysis});
  }

  function *postUpdate(analysisNumber, personID) {
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
