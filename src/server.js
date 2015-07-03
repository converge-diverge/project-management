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
  organizers: [{
    name: 'Kevin Wilcox',
    email: 'wilcoxkr@gmail.com'
  },{
    name: 'Sally Koerner',
    email: 'sally.koerner@duke.edu'
  },{
    name: 'Emily Grman',
    email: 'emily@emily.com'
  }]
};

module.exports = {
  start
};

function start(config, database, data) {
  const server = koa();

  const routes = {
    consentStatus,
    consentSendGet,
    consentSendPost,
    consentForm,
    updateConsent
  };

  server.use(function *(next){
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

  server.use(bodyparser());
  server.use(handlebars({cache: false}));

  server.use(mount('/admin', auth({name: 'k', pass: 'k'})));

  server.use(route.get('/admin/status', routes.consentStatus));
  server.use(route.get('/admin/send', routes.consentSendGet));
  server.use(route.post('/admin/send', routes.consentSendPost));
  server.use(route.get('/consent/form/:personID', routes.consentForm));
  server.use(route.post('/consent/update/:analysisNumber/:personID', routes.updateConsent));

  const {ports, cert, key} = config;

  http.createServer(server.callback()).listen(ports.http);
  https.createServer({ca:[], cert, key}, server.callback()).listen(ports.https);
  // server.listen(port);


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
      return on === 'on' ? projectID : undefined;
    }), projectID => {
      return projectID !== undefined;
    });

    const persons = _.unique(_.map(projects, projectID => {
      const project = getProject(projectID),
            {personID} = project,
            person = getPerson(personID);

      return person;
    }));

    console.log({projects, persons});

    sendEmails(persons);

    function sendEmails(persons) {
      const transporter = mailer.createTransporter({
        service: 'Gmail',
        auth: {

        }
      });

      _.each(persons, sendEmail);

      function sendEmail(person) {

      }
    }
  }

  function *consentForm(personID) {
    const person = database[personID];

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
