let connectedUsersNames = new Set();
let userList = new Set();
let lobbyList = [];
let lobbyIdCounter = 0;
let messageQueue = []; 
//const {User, Lobby, Player} = require('../entities.js');


const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const fs = require('fs');

const dict = JSON.parse(fs.readFileSync('./nouns.json')).nouns;

exports.server = {
  run(port) {
    server.listen(port, () => {
      console.log('Server listening at port %d', port);
    });
  },
};

io.on('connection', (socket) => {
  let username;
  let useravatar;
/*
*       LOGIN STUF
*
*/
  socket.on('user_login', (user_data) => {
      username = JSON.parse(user_data).username;
      useravatar = JSON.parse(user_data).useravatar;
      if(connectedUsersNames.has(username)) {
          console.log(`Username ${username} is already connected.`);
          socket.emit('wrong_username');
          return;
      }
      connectedUsersNames.add(username);
      let newUser = new User(username, useravatar);
      userList.add(newUser);
      socket.emit('success_login');
      console.log(`User ${username} has successfully connected.`);
  });
  socket.on('user_logout', (uname) => {
    console.log(`USER LOGOUT: ${uname}`);
    for(u of userList) {
      if(u.userName == uname) {
        connectedUsersNames.delete(uname);
        userList.delete(u);
        console.log(`User ${uname} left the server`);
        return;
      }
    }
    console.log(`ERR: User ${uname} wasn't found in the userList!`);
  });
/*
*     CHAT STUF
*
*/
  socket.on('fetch_message_list', () => {
    socket.emit('pull_message_list', messageQueue);
  });
  socket.on('mes', (userName, mes) => {
    let dateTime = new Date();
    let mesLog = `{"dateTime" : "${dateTime.toString()}", "userName" : "${userName}", "message" : "${mes}"}`;
    messageQueue.push(mesLog);
    if(messageQueue.length == 64) {
      messageQueue.shift();
    }
    io.emit('newMessage', userName, mes);
    let time = dateTime.toLocaleTimeString();
    console.log(`${time} MES: '${userName}: ${mes}'`);
  });
/*
*     LOBBY STUF
*
*/
  socket.on('create_lobby', (lobby_data) => {
    let lobby = JSON.parse(lobby_data);
    for(l of lobbyList) {
      if(l.title == lobby.title) {
        socket.emit('wrong_lobby_data');
        console.log(`ERR! Lobby ${l.title} already exists!`);
        return;   
      }
    }
    let newLobby = new Lobby(socket, lobby.title, lobbyIdCounter++, lobby.pass, lobby.host, lobby.maxPlayers, socket);
    lobbyList.push(newLobby);
  });
  socket.on('fetch_lobby_list', () => {
    //Create json with all lobbies 
    let lobbyJson = `{
      "lobbyList":
         [
           `;
    for(l of lobbyList) {
      lobbyJson += `{
        "id" : "${l.id}",
        "title" : "${l.title}",
        "passlen" : "${l.pass.length}",
        "connected" : "${l.playerList.length}",
        "required" : "${l.maxPlayers}",
        "gameHasbegun": "${String(l.gameHasbegun)}"
      },
      `;
    }
    lobbyJson = lobbyJson.slice(0, -8);
    lobbyJson += `]
    }`;
    socket.emit('pull_lobby_list', lobbyJson);
  });
  socket.on('can_i_join_lobby', (lobbyId, pass) => {
    for(l of lobbyList) { if(l.id == lobbyId) {
        let cause = ''; 
        if(l.gameHasBegun == true) {
          cause = 'started';
          socket.emit('no_welcome', cause, lobbyId); 
        }
        else if(l.playerList.length == l.maxPlayers) {
          cause = 'lobby';
          socket.emit('no_welcome', cause, lobbyId); 
        }
        else if(l.pass != pass) {
          cause = 'pass';
          socket.emit('no_welcome', cause, lobbyId); 
        }
        else socket.emit('welcome', lobbyId);
      }
    }
  });
  socket.on('join_lobby', (lobbyId, username, useravatar) => {
    for(l of lobbyList) {
      if(l.id == lobbyId) {
        l.addPlayer(username, useravatar, socket);
        let playerListJson = `{ "playerList" : [`;
        for(p of l.playerList) {
          playerListJson += `{"playerName" : "${p.playerName}", "playerAvatar" : "${p.playerAvatar}", "playerPoints" : "${p.getPoints()}"},`;
        }
        playerListJson = playerListJson.slice(0, -1);
        playerListJson += `]}`;
        socket.emit('succsess_lobby_connection', playerListJson);
      }
    }
  });
  socket.on('host_join_lobby', (username) => {
    for(l of lobbyList) { if(l.host == username) {
      socket.emit('welcome', l.id);
      }
    }
  });
  socket.on('player_leave_lobby', (playerName, lobbyId) => {
    console.log(`Kicking ${playerName}`);
    for(l of lobbyList) {
      if(l.id == lobbyId) {
        l.kickPlayer(playerName, socket);
        return;
      }
    }
    socket.broadcast.emit('lobbyListChanges');
  });
  socket.on('start_game', (lobbyId, socket) => {
    for(l of lobbyList) {
      if(l.id == lobbyId) {
        l.startGame(io, socket);
      }
    }
  });
  socket.on('check_word', (word, fn) => {
    if(dict.includes(word.toLowerCase())) {
      console.log(`The word '${word} exists.'`);
      fn(true);
    }
    else {
      console.log(`The word '${word} does not exist.'`);
      fn(false);
    }
  });
  socket.on('i_end_turn', (lobbyId, usedWord, playerName, letter, letterCoord) => {
    socket.to(lobbyId).emit('board_changes', usedWord, playerName, letter, letterCoord);
    for(l of lobbyList) {
      if(l.id == lobbyId) {
        for(p of l.playerList) { if(p.playerName == playerName) p.addPoints(usedWord.length);}
        l.nextTurn(io);
      }
    }
  });
});


class Lobby {
  constructor(socket, title, id, pass, hostUser, maxPlayers) {
    this.title = title;
    this.id = id;
    this.pass = pass;
    this.host = hostUser;
    this.maxPlayers = maxPlayers;
    this.nowTurnPlayer;
    this.filledLetters = 7;
    this.gameHasBegun = false;
    if(maxPlayers > 3) {
      this.endOfTheGameTurn = 40;
    }
    else this.endOfTheGameTurn = 42;
    this.turnCounter = 0;
    socket.broadcast.emit('new_lobby_created', this.id, this.title, this.pass.length, this.playerList.length, Number(this.maxPlayers));
    console.log(`Lobby '${this.title}' was succsessfully created by ${this.host}`);
  }
  playerList = []; //userName
  initWord = 'ПАРОХОД';
  
  addPlayer(userName, userAvatar, socket) {
    if(this.playerList.length < this.maxPlayers) {
      let player = new Player(userName, userAvatar, socket);
      this.playerList.push(player);
      console.log(`Player ${player.playerName} has succsessfuly connected to lobby ${this.title}`);
      socket.broadcast.emit('lobbyListChanges');
      socket.join(this.id);
      socket.to(this.id).emit('playerConnected', player.playerName, player.playerAvatar, player.getPoints());
    }
  }
  kickPlayer(playerName, socket) {
    for(p of this.playerList) {
      if(p.playerName == playerName) {
        this.playerList.splice(p, 1);
        console.log(`Player ${playerName} disconnected from the '${this.title}'`);
        socket.to(this.id).emit('playerDisconnected', playerName);
        if(this.playerList.length < 1) {
          console.log(`Lobby ${this.id} is empty. deleting`);
          for(l of lobbyList) {
            if(l == this) {
              lobbyList.splice(l, 1);
            }
          }
        }
        socket.broadcast.emit('lobbyListChanges');
        return;
      }
    }
    console.log('ERROR! This user wasn\'t found in the lobby');
  } 
  
  startGame(io) { 
    //Send start game signal to all clients from the playerList
    this.gameHasBegun = true;
    io.to(this.id).emit('game_started', this.initWord);
    this.nowTurnPlayer = 0; //Or shuffle playerlist before
    this.turnCounter++;
    io.to(this.id).emit('now_turns', this.playerList[this.nowTurnPlayer].playerName);
  }
  nextTurn(io) {
    if(this.turnCounter != this.endOfTheGameTurn) {
      if(this.nowTurnPlayer == this.maxPlayers - 1)
        this.nowTurnPlayer = 0;
      else this.nowTurnPlayer = this.nowTurnPlayer + 1;
      this.turnCounter++;
      io.to(this.id).emit('now_turns', this.playerList[this.nowTurnPlayer].playerName);
    }
    else this.endGame(io);
  }
  endGame(io) {
    //End game signal to trigger end-game window 
    let winner = this.playerList[0];
    for(p of this.playerList) {
      if(p.getPoints() > winner.getPoints()) winner = p;
      else continue;
    }
    io.to(this.id).emit('end_game', winner.playerName);
    console.log(`Winner at lobby "${this.title}": ${winner.playerName}! He beat ${winner.getPoints()} letters!`);
  }
}
class User {
  constructor(userName, userAvatar) {
    this.userName = userName;
    this.userAvatar = userAvatar;
  }
}
class Player {
  constructor(userName, userAvatar, socket) {
      this.playerName = userName;
      this.playerAvatar = userAvatar;
      this.socket = socket;
  }
  #points = 0;
  addPoints(points) {
      this.#points += points;
  }
  getPoints() {
    return this.#points;
  }
}


