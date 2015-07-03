require('babel/polyfill');

import fs from 'fs';
import util from 'util';

import _ from 'lodash';

import data from './data';
import server from './server';


const cert = fs.readFileSync('./keys/cert'),
      key = fs.readFileSync('./keys/key');

const config = {
  host: process.env.host || '192.168.1.244:8257' || 'localhost:80',
  ports: {
    http: 8257,
    https: 8258
  },
  cert,
  key
};

data.getOrCreate((err, database) => {
  if (err) throw err;

  if (database) {
    data.save(database, () => {
      // log({database});

      let count = 0;
      _.each(database, (person, email) => {
        count += person.projects.length;
      });

      console.log('Read', _.keys(database).length, 'people!');
      console.log('Read', count, 'projects!');

      server.start(config, database, data);
    });
  }
});

function log(o) {
  console.log(util.inspect(o, false, null));
}

