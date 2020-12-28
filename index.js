require('dotenv-flow').config();
const WebSocket = require('ws');
const { Sequelize } = require('sequelize');
let db = require('./db');
const helpers = require('./helpers');

const wss = new WebSocket.Server({ port: process.env.PORT  });

//helpers.dbINIT(); //Uncomment only when initialising db

wss.on('connection', async (ws, req) => {
  const room = req.url.substr(1);

  try {
    //Check if room exists & get tempo
    const rooms = await db.query(`SELECT id, tempo FROM rooms WHERE name = '${room}'`, { type: Sequelize.QueryTypes.SELECT });
    if (rooms.length === 0) {
      throw 'Room not found.'
    }
    const tempo = rooms[0].tempo;
    const roomId = rooms[0].id;

    //Add client to room & room to client
    if (!helpers.rooms[room]) {
      //Create room first
      helpers.rooms[room] = [];
    }
    helpers.rooms[room].push(ws);
    ws.room = room

    //Get all scenes and tracks
    const scenes = await db.query(`SELECT id FROM scenes WHERE "roomId" = ${roomId} ORDER BY id ASC`, { type: Sequelize.QueryTypes.SELECT });

    for (let scene of scenes) {
      const tracks = await db.query(`SELECT id, name, url, sequence, gain FROM tracks WHERE "sceneId" = ${scene.id}`, { type: Sequelize.QueryTypes.SELECT });
      scene.tracks = tracks;
    }

    ws.send(JSON.stringify({
      type: 'init',
      tempo,
      scenes
    }));
  }
  catch (err) {
    console.log(err);
  }

  ws.on('message', function incoming(_data) {
    const data = JSON.parse(_data);

    switch (data.type) {
      case 'SEQ_BUTTON_PRESS':
        helpers.seqButtonPress(data.trackId, data.position, ws);
        break;
      case 'CHANGE_TEMPO':
        helpers.changeTempo(data.tempo, ws);
        break;
      case 'CHANGE_SOUND':
        helpers.changeSound(data, ws);
        break;
      case 'CHANGE_GAIN':
        helpers.changeGain(data, ws);
        break;
      case 'ADD_TRACK':
        helpers.addTrack(data, ws);
        break;
      case 'DELETE_TRACK':
        helpers.deleteTrack(data, ws);
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
