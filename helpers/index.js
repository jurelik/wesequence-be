const { Sequelize } = require('sequelize');
const { S3, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { nanoid } = require('nanoid');
const { decode, encode } = require('base64-arraybuffer')
const scribble = require('scribbletune');
const fetch = require('node-fetch');
const archiver = require('archiver');
const fs = require('fs');
const fsp = require('fs/promises');
const db = require('../db');
const models = require('../models');
const rooms = {} //Global rooms object

//Init connection to AWS S3
const REGION = 'eu-west-2';
const bucketName = 'postead';
const s3 = new S3({ region: REGION });

const dbINIT = () => {
  models.sequelize.sync().then(async () => {
    const t = await db.transaction();

    try {
      await db.query(`INSERT INTO rooms (name, "createdAt", "updatedAt") VALUES ('test', NOW(), NOW())`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
      await db.query(`INSERT INTO scenes ("createdAt", "updatedAt", "roomId") VALUES (NOW(), NOW(), 1)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
      await db.query(`INSERT INTO scenes (name, "createdAt", "updatedAt", "roomId") VALUES ('Test Scene', NOW(), NOW(), 1)`, { type: Sequelize.QueryTypes.INSERT, transaction: t  })
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

//UTILS

const stringToArraybuffer = (str) => {
  return decode(str);
}

const updateRoom = async (roomId, t) => {
  try {
    //Update room
    await db.query(`UPDATE rooms SET "updatedAt" = NOW() WHERE id = ${roomId}`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });
  }
  catch (err) {
    throw err;
  }
}

const createFileName = async (path, fileName, loopNo) => {
  try {
    //Check if file exists already
    let exists = true;
    await fsp.stat(`${path}${fileName}${loopNo > 0 ? `(${loopNo})` : ''}.mid`).catch(() => { exists = false; });
    if (exists) {
      return createFileName(path, fileName, loopNo + 1);
    }
    else {
      if (loopNo === 0) {
        return fileName;
      }
      else {
        return `${fileName}(${loopNo})`;
      }
    }
  }
  catch (err) {
    throw err;
  }
}

const checkFolderName = async (room, rand, folderName, loopNo) => {
  try {
    //Check if file exists already
    let exists = true;
    await fsp.stat(`./temp/${rand}/${room}/${folderName}${loopNo > 0 ? `(${loopNo})/` : '/'}`).catch(() => { exists = false; });
    if (exists) {
      return checkFolderName(room, rand, folderName, loopNo + 1);
    }
    else {
      if (loopNo === 0) {
        return folderName;
      }
      else {
        return `${folderName}(${loopNo})`;
      }
    }
  }
  catch (err) {
    throw err;
  }
}

const createSoundFile = (url, room, rand, folderName, fileName) => {
  return new Promise(async (resolve, reject) => {
    try {
      const fileFormat = url.substr(-4);
      const _res = await fetch(url);
      const dest = fs.createWriteStream(`./temp/${rand}/${room}/${folderName}/${fileName}${fileFormat}`);

      dest.on('finish', () => {
        console.log('WAV generated: ' + `./temp/${rand}/${room}/${folderName}/${fileName}${fileFormat}`)
        resolve();
      });

      _res.body.pipe(dest);
    }
    catch (err) {
      reject(err);
    }
  })
}

const createPackage = (room, rand, t) => {
  return new Promise(async (resolve, reject) => {
    try {
      const scenes = await db.query(`SELECT s.id, s.name FROM rooms AS r JOIN scenes AS s ON r.id = s."roomId" WHERE r.name = '${room}' ORDER BY s.id ASC`, { type: Sequelize.QueryTypes.SELECT, transaction: t });

      //Create a folder for the room that includes midi and sound files
      for (const scene of scenes) {
        const _folderName = scene.name ? scene.name : `Scene ${scenes.indexOf(scene) + 1}`;
        const folderName = await checkFolderName(room, rand, _folderName, 0);

        await fsp.mkdir(`./temp/${rand}/${room}/${folderName}`);
        const tracks = await db.query(`SELECT t.name, t.url, t.sequence, t.gain FROM scenes AS s JOIN tracks AS t ON s.id = t."sceneId" WHERE s.id = ${scene.id} ORDER BY t.id ASC`, { type: Sequelize.QueryTypes.SELECT, transaction: t });

        for (const track of tracks) {
          const pattern = convertSequence(track.sequence);
          const fileName = await createFileName(`./temp/${rand}/${room}/${folderName}/`, track.name, 0)
          createMIDI(pattern, track.gain, `./temp/${rand}/${room}/${folderName}/${fileName}.mid`, fileName)

          if (track.url) {
            await createSoundFile(track.url, room, rand, folderName, fileName);
          }
        }
      }

      //Create a zip file
      const output = fs.createWriteStream(`./temp/${rand}/${room}.zip`);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      output.on('finish', () => {
        resolve();
      });

      archive.pipe(output);
      archive.directory(`./temp/${rand}/${room}/`, `${room}`);
      archive.finalize();
    }
    catch (err) {
      console.log(err);
      reject (err);
    }
  })
}

const uploadSoundToS3 = async (file, extension) => {
  try {
    //Upload to AWS
    const key = `${nanoid(9)}.${extension}`;

    //Upload to s3
    const res = await s3.send(new PutObjectCommand({ Bucket: bucketName, Key: key, Body: file }));
    if (res.$metadata.httpStatusCode !== 200) throw `Error: ${res.$metadata.httpStatusCode}`; //Check for errors during upload

    return `https://${bucketName}.s3-${REGION}.amazonaws.com/${key}`;
  }
  catch (err) {
    throw err;
  }
}

const deleteSoundFromS3 = async (trackId, t) => {
  try {
    const track = await db.query(`SELECT url FROM tracks WHERE id = ${trackId}`, { type: Sequelize.QueryTypes.SELECT, transaction: t });
    if (!track[0].url) {
      return;
    }
    const key = track[0].url.substr(-13);

    //Delete from s3
    await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
  }
  catch (err) {
    throw err;
  }
}

const uploadTarToS3 = async (room, rand) => {
  try {
    //Upload to AWS
    const key = `${room}.zip`;
    const _file = await fsp.readFile(`./temp/${rand}/${room}.zip`)

    //Upload to s3
    await s3.send(new PutObjectCommand({ Bucket: bucketName, Key: key, Body: _file }));
    return `https://${bucketName}.s3-${REGION}.amazonaws.com/${key}`;
  }
  catch (err) {
    throw err;
  }
}

const deleteTarFromS3 = async (room) => {
  try {
    //Delete from s3
    await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: `${room}.zip` }));
  }
  catch (err) {
    throw err;
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

const createMIDI = (pattern, amp, path, trackName) => {
  // Create a clip that plays the middle C
  const clip = scribble.clip({
    notes: 'c4',
    subdiv: '16n',
    pattern,
    amp
  });

  // Render a MIDI file of this clip
  scribble.midi(clip, path, null, trackName);
}

//HELPERS
const handleConnection = async (ws, req) => {
  ws.isAlive = true;
  const room = req.url.substr(1);

  try {
    //Check if room exists & get tempo
    const _rooms = await db.query(`SELECT id, tempo FROM rooms WHERE name = '${room}'`, { type: Sequelize.QueryTypes.SELECT });
    if (_rooms.length === 0) {
      throw 'Room not found.'
    }
    const tempo = _rooms[0].tempo;
    const roomId = _rooms[0].id;

    //Add client to room & room to client
    if (!rooms[room]) {
      //Create room first
      rooms[room] = [];
    }
    rooms[room].push(ws);
    ws.room = room;
    ws.roomId = roomId;

    //Get all scenes and tracks
    const scenes = await db.query(`SELECT id, name FROM scenes WHERE "roomId" = ${roomId} ORDER BY id ASC`, { type: Sequelize.QueryTypes.SELECT });
    let tracks = []

    for (let scene of scenes) {
      const _tracks = await db.query(`SELECT id, "sceneId", name, url, sequence, gain FROM tracks WHERE "sceneId" = ${scene.id} ORDER BY id ASC`, { type: Sequelize.QueryTypes.SELECT });
      tracks = tracks.concat(_tracks);
    }

    ws.send(JSON.stringify({
      type: 'INIT',
      tempo,
      scenes,
      tracks,
      users: rooms[room].length
    }));

    //Send to other sockets in room
    sendToRoom({
      type: 'USER_JOINED',
    }, ws);
  }
  catch (err) {
    console.log(err)
    ws.send(JSON.stringify({
      type: 'INIT',
      err
    }));
    ws.close();
  }
}

const closeConnection = (ws) => {
  const room = rooms[ws.room];

  if (room) {
    room.splice(room.indexOf(ws), 1);

    //Check if room is empty and delete if so
    if (room.length === 0) {
      delete rooms[ws.room];
    }
    else {
      //Send to other sockets in room
      sendToRoom({
        type: 'USER_LEFT',
      }, ws);
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

  try {
    //Check if a recently uploaded file already exists
    const _room = await db.query(`SELECT url FROM rooms WHERE name = '${room}' AND "updatedAt" = "lastUpload"`, { type: Sequelize.QueryTypes.SELECT, transaction: t });

    if (_room.length === 1) {
      await t.commit();
      return res.redirect(_room[0].url);
    }

    //Create a temp folder
    const rand = nanoid(9);
    //if(fs.existsSync(`./temp/${room}`)) {
    //  //Delete local files
    //  fs.rmdirSync(`./temp/${room}`, { recursive: true });
    //  fs.unlinkSync(`./temp/${room}.zip`);
    //}
    //fs.mkdirSync(`./temp/${room}`);
    await fsp.mkdir(`./temp/${rand}/${room}`, { recursive: true });

    await createPackage(room, rand, t);

    await deleteTarFromS3(room);
    const fileURL = await uploadTarToS3(room, rand);

    //Delete local files
    fs.rmdirSync(`./temp/${rand}`, { recursive: true });

    await db.query(`UPDATE rooms SET url = '${fileURL}', "lastUpload" = NOW(), "updatedAt" = NOW() WHERE name = '${room}'`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });

    await t.commit();
    res.redirect(fileURL);
  }
  catch (err) {
    await t.rollback();
    console.log(err)
    res.end(JSON.stringify({
      type: 'error',
      err
    }))
  }
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
    const arraybuffer = stringToArraybuffer(data.arraybuffer);

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

    await deleteSoundFromS3(data.trackId, t);
    const fileURL = await uploadSoundToS3(arraybuffer, extension)

    //Update db
    await db.query(`UPDATE tracks SET url = '${fileURL}' WHERE id = ${data.trackId}`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });

    //Update room
    await updateRoom(ws.roomId, t);

    await t.commit();

    //Send to other sockets in room
    sendToRoom({
      type: 'CHANGE_SOUND',
      trackId: data.trackId,
      arraybuffer: data.arraybuffer,
      url: fileURL
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

    //Update room
    await updateRoom(ws.roomId, t);

    await t.commit();

    sendToRoom({
      type: 'CHANGE_GAIN',
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

    //Update room
    await updateRoom(ws.roomId, t);

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

    //Update room
    await updateRoom(ws.roomId, t);

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

    //Update room
    await updateRoom(ws.roomId, t);

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

const changeTrackName = async (data, ws) => {
  const t = await db.transaction();

  try {
    await db.query(`UPDATE tracks SET name = '${data.name}' WHERE id = ${data.trackId}`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });

    //Update room
    await updateRoom(ws.roomId, t);

    await t.commit();

    sendToRoom({
      type: 'CHANGE_TRACK_NAME',
      sceneId: data.sceneId,
      trackId: data.trackId,
      name: data.name
    }, ws);
  }
  catch (err) {
    await t.rollback();
    console.log(err)
  }
}

const addScene = async (ws) => {
  const t = await db.transaction();

  try {
    const scene = await db.query(`INSERT INTO scenes ("roomId", "createdAt", "updatedAt") VALUES (${ws.roomId}, NOW(), NOW()) RETURNING id`, { type: Sequelize.QueryTypes.INSERT, transaction: t });

    //Update room
    await updateRoom(ws.roomId, t);

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

    //Update room
    await updateRoom(ws.roomId, t);

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

const duplicateScene = async (data, ws) => {
  const t = await db.transaction();

  try {
    const scene = await db.query(`INSERT INTO scenes ("name", "roomId", "createdAt", "updatedAt") SELECT CONCAT(name, ' - Copy'), "roomId", NOW(), NOW() FROM scenes WHERE id = ${data.sceneId} RETURNING id, name, "roomId"`, { type: Sequelize.QueryTypes.INSERT, transaction: t });
    const tracks = await db.query(`INSERT INTO tracks ("sceneId", name, url, sequence, gain, "createdAt", "updatedAt") SELECT ${scene[0][0].id}, name, url, sequence, gain, NOW(), NOW() FROM tracks WHERE "sceneId" = ${data.sceneId} ORDER BY id ASC RETURNING id, "sceneId", name, url, sequence, gain`, { type: Sequelize.QueryTypes.SELECT, transaction: t });

    //Update room
    await updateRoom(ws.roomId, t);

    await t.commit();

    sendToRoomAll({
      type: 'DUPLICATE_SCENE',
      scene: scene[0][0],
      tracks
    }, ws);
  }
  catch (err) {
    await t.rollback();
    console.log(err)
  }
}

const changeSceneName = async (data, ws) => {
  const t = await db.transaction();

  try {
    await db.query(`UPDATE scenes SET name = '${data.name}' WHERE id = ${data.sceneId}`, { type: Sequelize.QueryTypes.UPDATE, transaction: t });

    //Update room
    await updateRoom(ws.roomId, t);

    await t.commit();

    sendToRoom({
      type: 'CHANGE_SCENE_NAME',
      sceneId: data.sceneId,
      name: data.name
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
  handleConnection,
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
  changeTrackName,
  addScene,
  deleteScene,
  duplicateScene,
  changeSceneName
}
