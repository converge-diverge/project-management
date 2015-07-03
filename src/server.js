import koa from 'koa';
import bodyparser from 'koa-bodyparser';
import handlebars from 'koa-handlebars';
import route from 'koa-route';

import _ from 'lodash';

const analysis = {
  number: 1,
  title: 'Patches are AMAZING!',
  abstract: 'Patches of vegetation are so cool. But no one really studies them. Until now! We propose to analyze patches of vegetation in the best way possible. Please let us use your data to do it.',
  organizers: [{
    name: 'Kevin Wilcox',
    email: 'krwilcox@gmail.com'
  },{
    name: 'Sally Koerner',
    email: 'skoerne@duke.edu'
  },{
    name: 'Emily Grman',
    email: 'emily@emily.com'
  }]
};

module.exports = {
  start
};

function start(port, database, data) {
  const server = koa();

  const routes = {
    consentStatus,
    consentSendGet,
    consentSendPost,
    consentForm,
    updateConsent
  };

  server.use(bodyparser());
  server.use(handlebars({cache: false}));

  server.use(route.get('/consent/status', routes.consentStatus));
  server.use(route.get('/consent/send', routes.consentSendGet));
  server.use(route.post('/consent/send', routes.consentSendPost));
  server.use(route.get('/consent/form/:personID', routes.consentForm));
  server.use(route.post('/consent/update/:analysisNumber/:personID', routes.updateConsent));

  server.listen(port);

  console.log('Server is listening on port', port);

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

  function getProject(projectID) {
    let p;
    _.each(database, (person, personID) => {
      _.each(person.projects, project => {
        if (project.id === projectID) p = project;
      });
    });
    return p;
  }
}
