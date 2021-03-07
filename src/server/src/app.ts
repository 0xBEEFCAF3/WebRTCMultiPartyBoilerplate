import express from "express";
import compression from "compression";  // compresses requests
import session from "express-session";
import bodyParser from "body-parser";
// import lusca from "lusca";
// import mongo from "connect-mongo";
// import flash from "express-flash";
// import path from "path";
// import mongoose from "mongoose";
// import passport from "passport";
// import bluebird from "bluebird";
// import { MONGODB_URI, SESSION_SECRET } from "./util/secrets";
import cors from "cors";

// const MongoStore = mongo(session);

// Controllers (route handlers)
import * as apiController from "./controllers/api";
import { Socket } from "socket.io";

// Create Express server
const app = express();
app.use(cors());
const server = require('http').createServer(app);
const io = require("socket.io")(server, {
    cors: {origin: "*"},
    allowEIO3: true, // false by default
    origins: ["http://localhost:3000"],
  }
);

// Connect to MongoDB
// const mongoUrl = MONGODB_URI;
// mongoose.Promise = bluebird;

// mongoose.connect(mongoUrl, { useNewUrlParser: true, useCreateIndex: true, useUnifiedTopology: true } ).then(
//     () => { /** ready to use. The `mongoose.connect()` promise resolves to undefined. */ },
// ).catch(err => {
//     console.log(`MongoDB connection error. Please make sure MongoDB is running. ${err}`);
//     // process.exit();
// });

// Express configuration
app.set("port", 3333);

app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// app.use(session({
//     resave: true,
//     saveUninitialized: true,
//     secret: SESSION_SECRET,
//     store: new MongoStore({
//         url: mongoUrl,
//         autoReconnect: true
//     })
// }));
// app.use(passport.initialize());
// app.use(passport.session());
// app.use(flash());
// app.use(lusca.xframe("SAMEORIGIN"));
// app.use(lusca.xssProtection(true));
// app.use((req, res, next) => {
//     res.locals.user = req.user;
//     next();
// });


/**
 * Primary app routes.
 */
app.get("/", apiController.getApi);

interface IDictionary<TValue> {
    [rid: string]: TValue;
}

enum EVENTS {
    createRoom = "createRoom",
    joinRoom = "joinRoom",
    leaveRoom = "leaveRoom",
    // configRoom = "configRoom",
    connection = "connection",
    disconnect = "disconnect",
    signal = "signal",
    iceCandidate = "iceCandidate",
}

enum RESPONSES {
    roomCreated = "roomCreated", 
    playerJoined = "playerJoined", 
    error = "error",
    signal = "signal",
    iceCandidate = "iceCandidate",
}

const errorMessages : IDictionary<string> = {
    roomExists: "There is a room already with this room id",
    roomUndefined: "Room not founds",
    notInRoom: "This user is not in the room"
};

interface Player extends Socket {
    admin: boolean; // Are they the admin of their current room
}

const rooms: IDictionary<Player[]> = {};
const players : Player[] = [];
io.on(EVENTS.connection, (socket : Socket) => {
    // players.push({...socket, admin: false } as Player);
    socket.on(EVENTS.disconnect, () => {
        // const playerIdx = players.findIndex(socket);
        // players.splice(playerIdx, 1);
    });

    socket.on(EVENTS.createRoom, (payload : { rid:string, config: any }) => {
        if(rooms[payload.rid.toString()]) {
            socket.emit(RESPONSES.error, errorMessages.roomExists);
            return;
        }
        rooms[payload.rid] = [ { ...socket,  admin: true } as Player ];
        socket.join(payload.rid.toString());
        io.to(payload.rid).emit(RESPONSES.roomCreated);
    });

    socket.on(EVENTS.joinRoom, (payload: { rid: string }) => {
        if(!rooms[payload.rid]) {
            // Creating the room
            rooms[payload.rid] = [ { ...socket,  admin: true } as Player ];
            socket.join(payload.rid.toString());
            console.log('creating room', payload.rid);
            
            io.to(payload.rid).emit(RESPONSES.roomCreated);
            return;
        }
        console.log('joining room', payload.rid);
        rooms[payload.rid].push({ ...socket,  admin: true } as Player );
        socket.join(payload.rid.toString());
        io.to(payload.rid).emit(RESPONSES.playerJoined, socket.id);
    });

    socket.on(EVENTS.leaveRoom, (payload: { rid: string }) => {
        if(!rooms[payload.rid]) {
            socket.emit(RESPONSES.error, errorMessages.roomUndefined);
            return;
        }
        const playeridx = rooms[payload.rid].findIndex((player) => player.id === socket.id);
        rooms[payload.rid].splice(playeridx, 1);

        if(rooms[payload.rid].length <= 0) {
            delete rooms[payload.rid];
        }
    });

    // Web RTC signaling
    socket.on(EVENTS.signal, (payload : {rid: string, desc: {sdp: string, type: string }}) => {
        if(!rooms[payload.rid]) {
            socket.emit(RESPONSES.error, errorMessages.roomUndefined);
            return;
        }

        if(!socket.rooms.has(payload.rid)) {
            socket.emit(RESPONSES.error, errorMessages.roomUndefined);
            return; 
        }

        const player = rooms[payload.rid].find(p => p.id === socket.id);
        io.to(payload.rid).emit(RESPONSES.signal, { desc: payload.desc, player: player.id });
    });

    socket.on(EVENTS.iceCandidate, (payload : {rid: string, candidate: object }) => {
        console.log('ice candidate', payload);
        
        io.to(payload.rid).emit(RESPONSES.iceCandidate, payload);
    });

});

server.listen(3334);

export default app;
