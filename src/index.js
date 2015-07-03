require('babel/polyfill');

import util from 'util';

import _ from 'lodash';

import data from './data';
import server from './server';

const port = 8257;

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

      server.start(port, database, data);
    });
  }
});

function log(o) {
  console.log(util.inspect(o, false, null));
}

