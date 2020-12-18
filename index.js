require('dotenv-flow').config();
const WebSocket = require('ws');
const { Sequelize } = require('sequelize');
const models = require('./models');
const helpers = require('./helpers');

const wss = new WebSocket.Server({ port: process.env.PORT  });
const db = new Sequelize(`postgres://${process.env.DB_USER}@${process.env.DB_URL}:5432/${process.env.DB_NAME}`)

//helpers.dbINIT(); //Uncomment only when initialising db

wss.on('connection', async (ws, req) => {
  if (req.url === '/test') {
    // Add client to room & room to client
    helpers.rooms.test.push(ws);
    ws.room = req.url.substr(1);

    ws.send(JSON.stringify({
      type: 'init',
      scenes: [ [{
        name: 'kick',
        url: 'https://postead.s3.eu-west-2.amazonaws.com/kick.wav',
        sequence: [ 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0 ]
      }, {
        name: 'hh',
        url: 'https://postead.s3.eu-west-2.amazonaws.com/hh.wav',
        sequence: [ 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0 ]
      }] ]
    }));
  }
  else {
    ws.send(JSON.stringify({
      type: 'init',
      scenes: []
    }));
  }

  ws.on('message', function incoming(_data) {
    const data = JSON.parse(_data);

    switch (data.type) {
      case 'SEQ_BUTTON_PRESS':
        helpers.sendToRoom({
          type: 'SEQ_BUTTON_PRESS',
          trackName: data.trackName,
          position: data.position
        }, ws);
        break;
      case 'CHANGE_TEMPO':
        helpers.sendToRoom({
          type: 'CHANGE_TEMPO',
          tempo: data.tempo
        }, ws);
        break;
      default:
        return null;
    }
  });

  ws.on('close', () => {
    helpers.rooms.test.splice(helpers.rooms.test.indexOf(ws), 1);
  })
});

wss.on('listening', async () => {
  console.log('Server is listening on port ' + process.env.PORT + '.');
})
