const { Sequelize } = require('sequelize');
const { S3, PutObjectCommand } = require('@aws-sdk/client-s3');
const { nanoid } = require('nanoid');
const { decode, encode } = require('base64-arraybuffer')
const scribble = require('scribbletune');
const fetch = require('node-fetch');
const tar = require('tar');
const fs = require('fs');
const db = require('../db');
const models = require('../models');
const rooms = {} //Global rooms object

//Init connection to AWS S3
const REGION = 'eu-west-2';
const s3 = new S3({ region: REGION });

const dbINIT = () => {
  models.sequelize.sync().then(async () => {
    const t = await db.transaction();

    try {
      await db.query(`INSERT INTO rooms (name, "createdAt", "updatedAt") VALUES ('test', NOW(), NOW())`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
      await db.query(`INSERT INTO scenes ("createdAt", "updatedAt", "roomId") VALUES (NOW(), NOW(), 1)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
      await db.query(`INSERT INTO scenes ("createdAt", "updatedAt", "roomId") VALUES (NOW(), NOW(), 1)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
      await db.query(`INSERT INTO tracks (name, url, sequence, "createdAt", "updatedAt", "sceneId") VALUES ('kick', 'https://postead.s3.eu-west-2.amazonaws.com/kick.wav', ARRAY [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0], NOW(), NOW(), 1)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
      await db.query(`INSERT INTO tracks (name, url, sequence, "createdAt", "updatedAt", "sceneId") VALUES ('hh', 'https://postead.s3.eu-west-2.amazonaws.com/hh.wav', ARRAY [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], NOW(), NOW(), 1)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
      await db.query(`INSERT INTO tracks (name, url, sequence, "createdAt", "updatedAt", "sceneId") VALUES ('hh', 'https://postead.s3.eu-west-2.amazonaws.com/hh.wav', ARRAY [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], NOW(), NOW(), 2)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
      await db.query(`INSERT INTO tracks (name, url, sequence, "createdAt", "updatedAt", "sceneId") VALUES ('hh', 'https://postead.s3.eu-west-2.amazonaws.com/hh.wav', ARRAY [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], NOW(), NOW(), 2)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
      await t.commit();
    }
    catch (err) {
      await t.rollback();
      console.log(err);
    }
  }).catch(err => {
    console.error(err);
  });
}

const stringToArraybuffer = (str) => {
  return decode(str);
}

const closeConnection = (ws) => {
  const room = rooms[ws.room];

  if (room) {
    room.splice(room.indexOf(ws), 1);

    //Check if room is empty and delete if so
    if (room.length === 0) {
      delete rooms[ws.room];
    }
  }
}

const sendToRoom = (payload, ws) => {
  for (const socket of rooms[ws.room]) {
    if (socket !== ws) {
      socket.send(JSON.stringify(payload));
    }
  }
}

const sendToRoomAll = (payload, ws) => {
  for (const socket of rooms[ws.room]) {
    socket.send(JSON.stringify(payload));
  }
}

const handleDownload = async (req, res) => {
  const t = await db.transaction();
  const room = req.params.room;
  if(!fs.existsSync(`./temp/${room}`)) {
    fs.mkdirSync(`./temp/${room}`);
  }

  try {
    const scenes = await db.query(`SELECT s.id FROM rooms AS r JOIN scenes AS s ON r.id = s."roomId" WHERE r.name = '${room}'`, { type: Sequelize.QueryTypes.SELECT, transaction: t });

    //Create a folder for the room that includes midi and sound files
    for (const scene of scenes) {
      fs.mkdirSync(`./temp/${room}/${scene.id}`);
      const tracks = await db.query(`SELECT t.name, t.url, t.sequence, t.gain FROM scenes AS s JOIN tracks AS t ON s.id = t."sceneId" WHERE s.id = ${scene.id}`, { type: Sequelize.QueryTypes.SELECT, transaction: t });

      for (const track of tracks) {
        const pattern = convertSequence(track.sequence);
        createMIDI(pattern, track.gain, `./temp/${room}/${scene.id}/${track.name}.mid`)

        if (track.url) {
          const fileFormat = track.url.substr(-4);
          const _res = await fetch(track.url);
          const dest = fs.createWriteStream(`./temp/${room}/${scene.id}/${track.name}${fileFormat}`);
          await _res.body.pipe(dest);
        }
      }
    }

    //Create a tar.gz file
    await tar.c({
      gzip: true,
      file: `./temp/${room}.tar.gz`,
      C: 'temp'
    }, [`./${room}`]);

    const tarFile = fs.readFileSync(`./temp/${room}.tar.gz`)

    //Upload to AWS
    const key = `${nanoid(6)}-${room}.tar.gz`;
    const bucketName = 'postead'

    //Upload to s3
    await s3.send(new PutObjectCommand({ Bucket: 'postead', Key: key, Body: tarFile }));
    const fileURL = `https://${bucketName}.s3-${REGION}.amazonaws.com/${key}`;

    //Delete local files
    fs.rmdirSync(`./temp/${room}`, { recursive: true });
    fs.unlinkSync(`./temp/${room}.tar.gz`);

    await db.query(`UPDATE rooms SET url = '${fileURL}', "lastUpload" = NOW(), "updatedAt" = NOW() WHERE name = '${room}'`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });

    await t.commit();
    res.redirect(fileURL);
  }
  catch (err) {
    await t.rollback();
    console.log(err)
    res.end('error')
  }
}

const convertSequence = (sequence) => {
  const convertedSequence = sequence.map(step => {
    if (step === 1) {
      return 'x';
    }
    else {
      return '-';
    }
  });
  return convertedSequence.join('');
}

const createMIDI = (pattern, amp, path) => {
  // Create a clip that plays the middle C
  const clip = scribble.clip({
    notes: 'c4',
    subdiv: '16n',
    pattern,
    amp
  });

  // Render a MIDI file of this clip
  scribble.midi(clip, path);
}


const createRoom = async (req, res) => {
  const t = await db.transaction();

  try {
    const name = nanoid(9);
    const room = await db.query(`INSERT INTO rooms (name, "createdAt", "updatedAt") VALUES ('${name}', NOW(), NOW()) RETURNING id`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });
    await db.query(`INSERT INTO scenes ("roomId", "createdAt", "updatedAt") VALUES (${room[0][0].id}, NOW(), NOW())`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });
    await t.commit();

    res.end(JSON.stringify({
      type: 'SUCCESS',
      name
    }));
  }
  catch (err) {
    await t.rollback();
    res.end(JSON.stringify({
      type: 'ERROR',
      err
    }));
    console.log(err);
  }
}

const changeTempo = async (tempo, ws) => {
  const t = await db.transaction();

  try {
    //Make sure tempo is above 50
    tempo = tempo < 50 ? 50 : tempo;

    //Update db
    await db.query(`UPDATE rooms SET tempo = ${tempo} WHERE name = '${ws.room}'`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });
    await t.commit();

    //Send to other sockets in room
    sendToRoom({
      type: 'CHANGE_TEMPO',
      tempo
    }, ws);
  }
  catch (err) {
    await t.rollback();
    console.log(err);
  }
}

const changeSound = async (data, ws) => {
  const t = await db.transaction();

  try {
    const arraybuffer = await stringToArraybuffer(data.arraybuffer);

    //Get filetype
    let extension;

    if (data.fileType === 'audio/wav') {
      extension = 'wav'
    }
    else if (data.fileType === 'audio/mpeg') {
      extension = 'mp3'
    }
    else {
      throw 'Wrong file type.'
    }

    //Check if the file is bigger then 2MB
    if (arraybuffer.byteLength > 2000000) {
      throw 'File too big to upload.'
    }

    const key = `${nanoid()}.${extension}`;
    const bucketName = 'postead'

    //Upload to s3
    await s3.send(new PutObjectCommand({ Bucket: 'postead', Key: key, Body: arraybuffer }));
    const fileURL = `https://${bucketName}.s3-${REGION}.amazonaws.com/${key}`;

    //Update db
    await db.query(`UPDATE tracks SET url = '${fileURL}' WHERE id = ${data.trackId}`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });
    await t.commit();

    //Send to other sockets in room
    sendToRoom({
      type: 'CHANGE_SOUND',
      sceneId: data.sceneId,
      trackId: data.trackId,
      arraybuffer: data.arraybuffer
    }, ws);
  }
  catch (err) {
    await t.rollback();
    console.log(err);
  }
}

const changeGain = async (data, ws) => {
  const t = await db.transaction();

  try {
    await db.query(`UPDATE tracks SET gain = ${data.gain} WHERE id = ${data.trackId}`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });
    await t.commit();

    sendToRoom({
      type: 'CHANGE_GAIN',
      sceneId: data.sceneId,
      trackId: data.trackId,
      gain: data.gain
    }, ws);
  }
  catch (err) {
    await t.rollback();
    console.log(err);
  }
}

const seqButtonPress = async (data, ws) => {
  const t = await db.transaction();

  try {
    await db.query(`UPDATE tracks SET sequence[${data.position + 1}] = CASE WHEN sequence[${data.position + 1}] = 0 THEN 1 ELSE 0 END WHERE id = ${data.trackId}`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });
    await t.commit();

    sendToRoom({
      type: 'SEQ_BUTTON_PRESS',
      sceneId: data.sceneId,
      trackId: data.trackId,
      position: data.position
    }, ws);
  }
  catch (err) {
    await t.rollback();
    console.log(err);
  }
}

const addTrack = async (data, ws) => {
  const t = await db.transaction();

  try {
    const queryTracks = await db.query(`SELECT COUNT(t.id), s.id AS "sceneId" FROM rooms AS r JOIN scenes AS s ON s."roomId" = r.id LEFT JOIN tracks AS t ON t."sceneId" = s.id WHERE r.name = '${ws.room}' AND s.id = ${data.sceneId} GROUP BY r.id, s.id`, { type: Sequelize.QueryTypes.SELECT, transaction: t });
    const trackAmount = queryTracks[0].count;
    const sceneId = queryTracks[0].sceneId

    //BE CAREFUL - postgres uses one based arrays!
    const newTrackQuery = await db.query(`INSERT INTO tracks (name, "createdAt", "updatedAt", "sceneId") VALUES ('Track ${trackAmount + 1}', NOW(), NOW(), ${sceneId}) RETURNING id AS "trackId", name AS "trackName" `, { type: Sequelize.QueryTypes.INSERT, transaction: t });
    const newTrack = newTrackQuery[0][0];

    await t.commit();

    sendToRoomAll({
      type: 'ADD_TRACK',
      sceneId: data.sceneId,
      trackId: newTrack.trackId,
      trackName: newTrack.trackName
    }, ws)
  }
  catch (err) {
    await t.rollback();
    console.log(err)
  }
}

const deleteTrack = async (data, ws) => {
  const t = await db.transaction();

  try {
    await db.query(`DELETE FROM tracks WHERE id = ${data.trackId}`, { type: Sequelize.QueryTypes.DELETE, transaction: t });
    await t.commit();

    sendToRoom({
      type: 'DELETE_TRACK',
      sceneId: data.sceneId,
      trackId: data.trackId
    }, ws);
  }
  catch (err) {
    await t.rollback();
    console.log(err);
  }
}

const addScene = async (ws) => {
  const t = await db.transaction();

  try {
    const scene = await db.query(`INSERT INTO scenes ("roomId", "createdAt", "updatedAt") VALUES (${ws.roomId}, NOW(), NOW()) RETURNING id`, { type: Sequelize.QueryTypes.INSERT, transaction: t });

    await t.commit();

    sendToRoomAll({
      type: 'ADD_SCENE',
      sceneId: scene[0][0].id,
    }, ws);
  }
  catch (err) {
    await t.rollback();
    console.log(err)
  }
}

const deleteScene = async (data, ws) => {
  const t = await db.transaction();

  try {
    const countScenes = await db.query(`SELECT COUNT(id) FROM scenes WHERE "roomId" = ${ws.roomId}`, { type: Sequelize.QueryTypes.DELETE, transaction: t });

    if (countScenes[0].count < 2) {
      throw 'The last scene cannot be deleted.';
    }

    await db.query(`DELETE FROM scenes WHERE id = ${data.sceneId}`, { type: Sequelize.QueryTypes.DELETE, transaction: t });
    await t.commit();

    sendToRoom({
      type: 'DELETE_SCENE',
      sceneId: data.sceneId
    }, ws);
  }
  catch (err) {
    await t.rollback();
    console.log(err);
  }
}

module.exports = {
  rooms,
  dbINIT,
  stringToArraybuffer,
  closeConnection,
  sendToRoom,
  sendToRoomAll,
  handleDownload,
  createRoom,
  changeTempo,
  changeSound,
  changeGain,
  seqButtonPress,
  addTrack,
  deleteTrack,
  addScene,
  deleteScene
}
