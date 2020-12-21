require('dotenv-flow').config();
const WebSocket = require('ws');
const { Sequelize } = require('sequelize');
const helpers = require('./helpers');

//This command makes COUNT return integers instead of strings
require('pg').defaults.parseInt8 = true;

const wss = new WebSocket.Server({ port: process.env.PORT  });
const db = new Sequelize(`postgres://${process.env.DB_USER}@${process.env.DB_URL}:5432/${process.env.DB_NAME}`)

//helpers.dbINIT(db); //Uncomment only when initialising db

wss.on('connection', async (ws, req) => {
  const room = req.url.substr(1);

  try {
    //Check if room exists
    const rooms = await db.query(`SELECT id FROM rooms WHERE name = '${room}'`, { type: Sequelize.QueryTypes.SELECT });
    if (rooms.length === 0) {
      throw 'Room not found.'
    }

    //Add client to room & room to client
    if (!helpers.rooms[room]) {
      //Create room first
      helpers.rooms[room] = [];
    }
    helpers.rooms[room].push(ws);
    ws.room = room

    //Get all tracks in the first scene
    const tracks = await db.query(`SELECT t.id, t.name, t.url, t.sequence FROM rooms AS r JOIN scenes AS s ON s."roomId" = r.id JOIN tracks AS t ON t."sceneId" = s.id WHERE r.name = '${room}' AND s.num = 0`, { type: Sequelize.QueryTypes.SELECT });

    ws.send(JSON.stringify({
      type: 'init',
      scenes: [ tracks ]
    }));
  }
  catch (err) {
    console.log(err);
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
      case 'ADD_TRACK':
        helpers.addTrack(ws, db);
        break;
      case 'DELETE_TRACK':
        helpers.sendToRoom({
          type: 'DELETE_TRACK',
          trackName: data.trackName
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
