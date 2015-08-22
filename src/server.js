import util from 'util';

import fs from 'fs';

import http from 'http';
import https from 'https';

import constructStacks from 'koa-stacks';

import bodyparser from 'koa-bodyparser';
import handlebars from 'koa-handlebars';

import mailer from 'nodemailer';

import _ from 'lodash';

const analysis = {
  number: 1,
  title: 'Assessing the relative strengths of meta-community drivers of ecosystem stability',
  abstract: 'Stability is an important ecosystem attribute as it determines both the predictability of ecosystem functioning (e.g., primary productivity) as well as the potential for systems crossing catastrophic thresholds during years of extreme environmental conditions (e.g., the Dust Bowl of the 1930’s), the frequency of which are likely to increase with global change. Stability varies substantially across ecosystems and biomes and much of this variability can be attributed to differences in plant community structure. Local (α) diversity can impact stability through phenomena such as species and/or functional complementarity. Community turnover (β diversity) can control stability through asynchrony of patch-level responses in a single year. Recent theoretical work by Wang and Loreau (2014) uses the meta-community concept to identify a number of community-based mechanisms that may contribute to functional stability of the meta-community (Figure 1), and that are likely associated with various commonly measured diversity indices. However, integration of theory and empirical data is necessary to test these mechanisms and to determine the relative importance of various community attributes for ecosystem stability; to our knowledge, this has not been done previously. \n\nWe propose to use aboveground net primary productivity (ANPP) and species-level abundance data sets compiled by the Convergence-Divergence Project (CDP; 21 and 50 data sets, respectively) to address the following questions: (1) What are the relative contributions of α stability and β synchrony to ecosystem (γ) stability? (2) What are the relative contributions of species-level stability and species synchrony on α stability? (3) How predictive are α and β diversity measures for these mechanisms? To answer these questions, we will, using control data only, calculate the variables identified in Figure 1 as well as a number of common α and β diversity metrics (e.g., richness, H′) for each study. We will then use multiple regression techniques to assess relative contributions of these variables to ecosystem stability using both species-level and ANPP data sets. The CDP data set provides a unique opportunity to integrate theory with empirical data. This study will help direct future theoretical and empirical scientific studies, and will be important for informing land managers and policy makers in efforts to maintain sustainability of ecosystem function in the face of various global changes.',
  emailSubject: 'new opt-in converge/diverge analysis',
  variables: {
    explanatory: 'community composition (control plots only)',
    response: 'community composition and ANPP (control plots only)'
  },
  estimatedTimeline: 'analyses finalized by January, 2016; manuscript written by March, 2016; draft circulated to all co-authors by June, 2016',
  organizers: [{
    name: 'Kevin Wilcox',
    email: 'wilcoxkr@gmail.com'
  },{
    name: 'Sally Koerner',
    email: 'sally.koerner@duke.edu'
  },{
    name: 'Andrew Tredennick',
    email: 'atredenn@gmail.com'
  },{
    name: 'Emily Grman',
    email: 'egrman@emich.edu'
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
                'get':  getSend,
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
        },
        '/images/:imageID': {
          methods: {
            get: getImage
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
    const projects = getProjects();

    yield this.render('consentStatus', {projects});
  }

  function *getSend() {
    const projects = getProjects();

    yield this.render('consentSend', {projects});
  }

  function *postSend() {
    const {request} = this,
          {body} = request;

    // const projects = _.filter(_.map(body, (on, projectID) => {
    //   return on === 'on' ? getProject(projectID) : undefined;
    // }), project => (project !== undefined));

    const projects = _.reduce(body, (selected, on, projectID) => {
      if (on === 'on') {
        const project = getProject(projectID);

        if (!project) throw Error('Invalid projectID', projectID);

        selected.push(project);
      }
      return selected;
    }, []);


    // const projects = _.filter(
    //                       _.map(body, (on, projectID) => on === 'on' ? getProject(projectID) : undefined)
    //                       , project => (project !== undefined));

    const emails = _.map(_.groupBy(projects, 'personID'), (projects, personID) => {
      return {
        person: getPerson(personID),
        projects
      };
    });

    const names = _.pluck(analysis.organizers, 'name'),
          {host} = config;

    // can't use each to loop through, because we need to use 'yield' below...
    for (let i = 0; i < emails.length; i++) {
      const emailRecord = emails[i],
            {person} = emailRecord,
            {personID} = person,
            {abstract, estimatedTimeline, title, variables} = analysis;

      emailRecord.emailText = yield this.renderView('consentEmail', {
        organizers: names.join(', '),
        organizersWithAnd: makeAndText(names),
        link: `http://${host}/consent/form/${personID}`,
        title,
        abstract,
        variables,
        estimatedTimeline
      });
    }

    const emailCount = yield sendEmails(emails);

    this.body = `<!doctype html><html><head><meta http-equiv="refresh" content="4; url=/admin/status"></head><body><div>Tried to send ${emailCount} emails</div><div>Redirecting you to <a href="/admin/status">/admin/status</a> in 4 seconds</div></body></html>`;

    function sendEmails(emails) {
      return new Promise((resolve, reject) => {
        if (emails.length === 0) return resolve(0);

        const {email, password} = body;

        if (!email || !password) {
          return reject('No email or password!');
        }

        const transporter = mailer.createTransport({
          service: 'gmail',
          secure: true,
          auth: {
            user: email,
            pass: password
          }
        });

        let emailsToSend = emails.length;

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
            emailsToSend--;

            if (error) {
              console.log('Error sending mail', options, error);
            }
            else {
              const project = getProject(person.projectID);

              _.each(projects, project => {
                project.status.emailSent = true;
              });

              data.save(database);
              console.log('Email sent!', options,  info);
            }

            console.log(`${emailsToSend} emails remain...`);

            if (emailsToSend === 0) resolve(emails.length);
          });
        }
      });
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

  function *getImage(imageID) {
    const path = `${__dirname}/images/${imageID}`;

    this.type = 'image';
    this.body = fs.createReadStream(path);
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

  function getProjects() {
    return _.flatten(
             _.map(database,
                  ({projects}) =>
                  _.map(projects, project => (project))));

  }
}
