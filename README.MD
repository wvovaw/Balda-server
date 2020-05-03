# Server for the "Balda" game

![GitHub watchers](https://img.shields.io/github/watchers/wvovaw/Balda-server?label=Watched&style=social)
![GitHub deployments](https://img.shields.io/github/deployments/wvovaw/Balda-server/Balda-server)

## Functional of the server

### Server's part 

- [X] Connect users on the server.
- [X] Create in-game chat on lobby lists page. 
- [X] Implement chatting.
- [ ] Integrate a database to implement an account system.
- [ ] Collect statistics.

### Lobby part

- [X] Create lobby on user's demand.
- [X] Connect user to the lobby.
- [X] Disconnect user from the lobby.
- [X] Remove the lobby when nobody is connected to it.
- [X] Make impossible to connect to the game after it already has started.
- [X] Show the scoreboard after a game's over. Client leaves lobby when he close it. 
- [X] Start the game when all players are ready. ~~Build a circuled queue.~~

### In game part 

- [X] Toggle a round. The round ends after the players time is up or the player has finished his turn.
- [X] End the game when all letter blocks are filled. 
- [X] Remove a player from the queue if he is ~~disconnected (have some problems)~~ or he decided to leave the game.
- [X] Find the word in the dictionary.
- [ ] Implement a word suggestion system.