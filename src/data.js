import fs from 'fs';

import util from 'util';

import _ from 'lodash';
import uuid from 'uuid';

module.exports = {
  getOrCreate,
  save
};

// Creates a constant variable telling us where the data file of people is located
const peoplePath = './data/people.csv',
      databasePath = './data/database.json';

function getOrCreate(callback) {
  fs.readFile(databasePath, (err, data) => {
    if (err) return readPeoplePath(callback);

    callback(null, JSON.parse(data.toString()));
  });

  function readPeoplePath(callback) {
    fs.readFile(peoplePath, (err, data) => {
      if (err) return callback(err);

      const lines = data.toString().split('\n');

      const projects = _.map(lines.slice(1), line => {
        const [email, site, project] = line.split('\t');
        return {
          email,
          id: uuid.v4(),
          site,
          project,
          status: {
            emailSent: false,
            hasResponded: false,
            hasConsented: undefined,
            respondedAt: undefined
          }
        };
      });

      const people = _.mapKeys(_.mapValues(_.groupBy(projects, 'email'), (projects, email) => {
        const id = uuid.v4();

        return {
          id: id,
          email: email,
          projects: _.map(projects, project => {
            project.personID = id;

            return project;
          })
        };
      }), (value, key) => {
        return value.id;
      });

      callback(null, people);
    });
  }
}

function save(database, callback) {
  if (!database) throw new Error('Tried to save empty database!');

  fs.writeFile(databasePath, JSON.stringify(database, null, '  '), err => {
    console.log('Database saved!');
    if (callback) return callback(err);
    if (err) throw err;
  });
}