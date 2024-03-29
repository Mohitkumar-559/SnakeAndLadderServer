import {
    gameLog
} from 'utils/logger'
import {
    Table
} from '../table/table';
import {
    Player
} from '../player/player';
import {
    PlayerOpts,
    PlayerState
} from 'domain/entities/player/player.model';
import {
    WINNING_POSITION,
    SwitchSnakeOrLadderOrPower,
    PowerCard,
    ReasonMovePath
} from '../../entities/game/game.model'
import {
    ContestData,
    SnakePath,
    GameConfig,
    TURN_SKIP_REASON,
    GameState,
    GamePhase,
    GameLevel,
    GameWinningData,
    JoinContestResponse,
    GameMode,
    GameType,
    ExitReason
} from 'domain/entities/game/game.model';
import {
    BaseHttpResponse
} from 'utils';
import {
    GameServer
} from 'application';
import {
    isValidPawnPosition,
    isSafePosition,
    isValidPawnPositionPower,
    getRange
} from './path';
import {
    ContestWinnerRequest,
    TransactionTokenRequest
} from 'domain/entities/transaction/transaction.dto';
import {
    sendGameEndEvent
} from 'utils/game';
import {
    TableManager
} from '../table/table.manager';
import {
    Board
} from '../table/table.board'

const TURN_TIME = 20000;
const GAME_TIME = 120000;
const DELAY_IN_GAME_END = 2000;
const DELAY_IN_GAME_START = 5000;
const DELAY_IN_PRE_GAME_START = 1000;
const TOTAl_GAME_TURNS = 5;

export class Game extends Table {
    private phase: number // roll dice, pawnMove
    private diceValue: number // 6
    private rolledValues: Array < number > // [6,3]
        private turnTime: number
    private timeout: NodeJS.Timeout
    private lastTurnTimeMilli: number
    private gameStartTime: number
    private turnStartTime: number
    public gameTime: number
    private gameTimer: NodeJS.Timeout
    private isGameTimeOver: boolean
    public roomId: number;
    private hasKilled: boolean
    private noOfContestWinner: number;
    private noPlayerReachHome: number;
    private gameType: GameType;
    private gameMode: GameMode;
    private gameTurnRemaining: number;
    public gameConfig: GameConfig;
    public gameLevel: GameLevel;
    public xFacLogId: number;
    public xFacId: string;
    public gameId: number;
    private isPrivate: boolean;
    private totalTurn: number;
    public SnakeHead: Array < number > ;
    private SnakeTail: Array < number > ;
    private LadderHead: Array < number > ;
    public LadderTail: Array < number > ;
    private BoardId: number
    public PowerCard: Array < number > ;
    private PowerCardPath: Array < string > ;
    private PowerCan: Array < number >
    private isOnGameEndCallbackCalled: boolean
    private previousRollDice: Array < number > ;
    private Snake1: Array < string > ;
    private Snake2: Array < string > ;
    private Snake3: Array < string > ;
    private Snake4: Array < string > ;

    public constructor(opts: any) {
        super(opts);
        this.lastTurnTimeMilli = 0;
        this.rolledValues = [];
        this.phase = GamePhase.ROLL_DICE;
        // this.rollTime = ROLL_TIME;
        // this.moveTime = MOVE_TIME;
        this.turnTime = TURN_TIME
        this.gameTime = opts.gameTime || GAME_TIME;
        this.gameStartTime = Date.now();
        this.isGameTimeOver = false;
        this.isOnGameEndCallbackCalled = false
        this.noPlayerReachHome = 0
        this.hasKilled = false;
        this.gameType = GameType.NORMAL
        this.isPrivate = opts.isPrivate || false
        this.gameConfig = opts.gameConfig;
        this.gameMode = opts.gameMode || GameMode.TIME_BASED;
        this.gameTurnRemaining = opts.gameTurnRemaining || TOTAl_GAME_TURNS;
        this.totalTurn = opts.gameTurnRemaining || TOTAl_GAME_TURNS;
        this.xFacLogId = opts.xFacLogId
        this.players = opts.players ? opts.players.map((p: any) => {
            const player = new Player(p);
            return player;
        }) : []
        this.gameId = 5;
        this.BoardId = 1;
        this.SnakeHead = [];
        this.SnakeTail = [];
        this.LadderHead = [];
        this.LadderTail = [];
        this.PowerCard = [];
        this.PowerCan = [];
        this.PowerCardPath = [];
        this.Snake1 = [];
        this.Snake2 = [];
        this.Snake3 = [];
        this.Snake4 = [];
        this.previousRollDice = [0]

    }
    public initTableOnRestart(opts: any) {
        this._id = opts._id;
        this.capacity = opts.capacity;
        this.players = opts.players.map((p: any) => {
            const player = new Player(p);
            player.initOnRestart(p, this);
            return player;
        });
        this.state = opts.state;
        this.isFull = opts.isFull;
        this.turnIndex = opts.turnIndex;
        this.lastTurnTimeMilli = opts.lastTurnTimeMilli;
        this.phase = opts.phase;
        this.rolledValues = this.phase == GamePhase.MOVE_PAWN ? [opts.diceValue] : [];
        // this.rollTime = ROLL_TIME;
        // this.moveTime = MOVE_TIME;
        this.turnTime = opts.turnTime || TURN_TIME
        this.gameTime = opts.gameTime;
        this.gameStartTime = opts.gameStartTime;
        this.isGameTimeOver = opts.isGameTimeOver;
        this.roomId = opts.roomId;
        this.contestId = opts.contestId;
        this.isOnGameEndCallbackCalled = opts.isOnGameEndCallbackCalled
        this.noPlayerReachHome = opts.noPlayerReachHome;
        this.noOfContestWinner = opts.noOfContestWinner;
        this.gameType = opts.gameType || GameType.NORMAL;
        this.isPrivate = opts.isPrivate || false;
        this.gameConfig = opts.gameConfig;
        this.gameMode = opts.gameMode;
        this.gameTurnRemaining = opts.gameTurnRemaining
        this.totalTurn = opts.totalTurn
        this.xFacLogId = opts.xFacLogId
        this.previousRollDice = opts.previousRollDice
        gameLog('common', 'Game state reload=>', this);
        this.reStartGameCountDown();
        this.restartTurnTimeout();

    }
    public async onRollDice(playerId: string, dv: number): Promise < any > {
        this.log("User send custom dice value", dv);
        if (this.state !== GameState.RUNNING) {
            const error = new BaseHttpResponse(null, "Game not in running state !" + this.phase, 400, this.ID);
            throw error;
        };
        if (this.phase != GamePhase.ROLL_DICE) {
            const error = new BaseHttpResponse(null, "Invalid Phase" + this.phase, 400, this.ID);
            throw error;
        }
        const currentPlayer = this.getCurrentPlayer();
        if (currentPlayer.ID != playerId) {
            const error = new BaseHttpResponse(null, "Invalid User" + currentPlayer.ID, 400, this.ID);
            throw error;
        }

        currentPlayer.skipped(false);
        
        const diceValues = this.generateDv(currentPlayer, dv);
        let canMove = this.canMovePawn(currentPlayer.POS);
        //console.log("can move ", canMove);
        // no  pawn to move
        //if (canMove === false && !await this.checkGameTimeOverCondition(currentPlayer.ID)) {
        if (canMove === false) {
            this.changeTurn();
            const resp = {
                changeTurn: true,
                phase: this.phase,
                players: this.players.map(p => p.playerInfo),
                state: this.state,
                turnIndex: this.turnIndex,
                rolledValues: diceValues,
                // rollTime: this.rollTime,
                // moveTime: this.moveTime,
                turnTime: this.turnTime,
                gameMode: this.gameMode,
                gameTurnRemaining: this.gameTurnRemaining,
                // skip: {
                //     turnIndex: this.turnIndex,
                // }
            }
            this.sendLogInMongo('onRollDice');
            this.log(`Player - ${currentPlayer.ID} turn change while rolling dice. Reason player canMove false`, currentPlayer)
            //console.log("\n Change turn rolling phase for next player \n ");
            return resp;
        } else {
            //console.log("\n Move pawn for same player \n ");
            if (diceValues[diceValues.length - 1] == 6) {
                const tripple = currentPlayer.sixCounter(true);
                //if (tripple == 3 && !await this.checkGameTimeOverCondition(currentPlayer.ID)) {
                if (tripple == 3) {
                    currentPlayer.sixCounter(false);
                    this.changeTurn();
                    const resp = {
                        changeTurn: true,
                        phase: this.phase,
                        players: this.players.map(p => p.playerInfo),
                        state: this.state,
                        turnIndex: this.turnIndex,
                        rolledValues: diceValues,
                        // rollTime: this.rollTime,
                        // moveTime: this.moveTime,
                        turnTime: this.turnTime,
                        skip: {
                            turnIndex: this.turnIndex,
                            reason: TURN_SKIP_REASON.TRIPPLE_SIX
                        },
                        gameMode: this.gameMode,
                        gameTurnRemaining: this.gameTurnRemaining
                    }
                    this.sendLogInMongo('onRollDice');
                    this.log(`Player - ${currentPlayer.ID} turn change while rolling dice. Reason player has 3 six`, currentPlayer)
                    //console.log("\n Change turn rfor tripple sixes \n ");
                    return resp;
                }
            } else {
                currentPlayer.sixCounter(false);
            }
            this.movingPhase();
            await this.gameSync()
            this.sendLogInMongo('onRollDice');
            return {
                phase: this.phase,
                players: this.players.map(p => p.playerInfo),
                state: this.state,
                rolledValues: this.rolledValues,
                turnIndex: this.turnIndex,
                turnTime: this.turnTime,
                gameMode: this.gameMode,
                gameTurnRemaining: this.gameTurnRemaining
            }
        }

    }
    private async gameSync() {
        const resp = await GameServer.Instance.GameServices.syncGameState(this._id, this.redisSyncGameData())
    }
    private movingPhase() {
        // this.updateLastTurnTime();
        this.phase = GamePhase.MOVE_PAWN;
        // this.startMovingPhaseTimer();
    }
    private async checkGameTimeOverCondition(playerId: string) {
        // const currentPlayer = this.players.find(p=>p.ID == playerId);
        if (!this.isGameTimeOver) return false;
        // const playerId = currentPlayer.ID;
        const playingMembers = this.players.filter(p => p.isPlaying || p.ID == playerId);
        if (playingMembers[playingMembers.length - 1].ID == playerId) {
            this.log('Game is over after giving all chances due to timeout')
            await this.onGameCountDownTimeout();
            return true;
        }
        return false;
    }
    private async onGameCountDownTimeout() {
        this.log("\n Game End....coz of the timer");
        //console.log("\n Game End....coz of the timer")
        this.state = GameState.FINISHED;
        const userPrizes = await this.getContestPrize();
        this.log(`User prizes are(onTimeout) - `, userPrizes)
        const players = this.players.map(p => p.playerInfo).sort((a, b) => b.score - a.score);
        players.forEach(player => {
            let isExitPlayer = player.isExitPlayer
            const rank = this.assignRank(player.userId, isExitPlayer);
            const getPlayer = this.currentPlayer(player.pos);
            let state = isExitPlayer ? player.state : PlayerState.WON
            this.log(`Updateing player state on gametimeout -`, getPlayer.ID, state, rank, userPrizes[getPlayer.MID])
            getPlayer.updatePlayerState(state, rank, userPrizes[getPlayer.MID]);
        });
        //console.log("players ", players);
        //console.log("OnGame Time over ...");
        clearTimeout(this.gameTimer);
        this.clearAllTimeouts();
        this.onGameEnd();
    }
    public canMovePawn(playerIndex: number): boolean {
        const currentPlayer: Player = this.currentPlayer(playerIndex);
        return this.rolledValues.some(value => {
            return currentPlayer.canMoveAnyPawn(value);
        });
    }

    private generateDv(player: Player, dv: number): any {
        if (!dv) {
            // if (this.gameType == GameType.XFAC_HARD) {
            //     if (player.isXFac) {
            //         dv = player.xfac.getDv(player);
            //     } else {
            //         dv = XFac.getNonKillValue(player, this);
            //     }
            // } else if (this.gameType == GameType.XFAC_MEDIUM) {
            //     if (!player.isXFac) {
            //         dv = XFac.getNonKillValue(player, this);
            //     }
            // } else if (this.gameType == GameType.XFAC_EASY && Number(this.CONTEST_ID) == 1) {
            //     if (player.isXFac) {
            //         dv = player.xfac.getDv(player);
            //     }
            // }
            dv = dv || this.getDv(player);
        }
        this.diceValue = dv;
        this.rolledValues.push(this.diceValue);
        return this.rolledValues;
    }
    private getDv(player: Player) {
        let dv = player.DiceValue;
        if (dv == undefined) {
            this.log('User dv stack empty create new values')
            // If exiting value empty then generate new stack of value then pop the value
            this.generateDiceValue();
            dv = player.DiceValue;
        }
        this.log("Generate dv ", dv);

        return dv;

    }
    public generateDiceValue() {
        let MAX_STACK_SIZE = 10;
        let randomStack = this.generateRandomWeightage(MAX_STACK_SIZE);
        this.log('Random stack is ', randomStack);
        this.players.forEach((player) => player.DiceValueStack = this.shuffle(randomStack));
    }
    public async onMovePawn(playerId: string, pawnIndex: number, rolledIndex: number,diceValue:number) {
        let currentPlayer = this.getCurrentPlayer();
        
        //remove has power of opponenet
        let opponentPlayer:Player = this.getOpponentPlayer(currentPlayer.ID)
        await opponentPlayer.removePowerCounter()
        await currentPlayer.removePowerCounter();


        if (currentPlayer.ID != playerId) {
            const error = new BaseHttpResponse(null, "Invalid User" + currentPlayer.ID, 400, this.ID);
            throw error;
        }
        //RESET THE PLAYER GOT LADDER OR SANKE WHILE PLAYING
        this.players.forEach((player) => {
            player.resetSnakeAndLadder();
        })
        const resp = await this.changeCurrentPlayerCoinPosition(playerId, pawnIndex, rolledIndex,diceValue);
        this.log('Resp after pawn move', resp)


        // This insure last player get his chance complete(On 6,pawn kill, reach home).
        let nextPlayerId = this.getCurrentPlayer().ID
        if (resp ?.changeTurn == true && playerId != nextPlayerId) {
            //console.log('Change turn while move pawn')
            // const gameOver = await this.checkGameTimeOverCondition(playerId);
            // if (gameOver) {
            //     resp.state = this.state
            //     this.log('Gamze over while move pawn')
            //     // return httpResp;
            // }
        }
        resp.reason = ReasonMovePath.NORMAL
        const httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
        this.log('move pawn resp=>', httpResp);
        resp.gameMode = this.gameMode;
        resp.gameTurnRemaining = this.gameTurnRemaining
        GameServer.Instance.socketServer.emitToSocketRoom(this.ID, "movePawn", httpResp);
        this.sendLogInMongo('onMovePawn');
        await this.gameSync()
        return httpResp;
    }
    public async onPowerCard(playerId: string, pawnIndex: number, powerIndex: number, playerfor: string) {
        const currentPlayer = this.getCurrentPlayer();
        if (currentPlayer.ID != playerId) {
            const error = new BaseHttpResponse(null, "Invalid User" + currentPlayer.ID, 400, this.ID);
            throw error;
        }
        //give Power to player
        const resp = await this.usePowerCard(playerId, pawnIndex, powerIndex, playerfor);
        this.log('Resp after pawn move', resp)
        resp.reason = ReasonMovePath.POWER


        // This insure last player get his chance complete(On 6,pawn kill, reach home).
        let nextPlayerId = this.getCurrentPlayer().ID
        if (resp?.changeTurn == true && playerId != nextPlayerId) {
            //console.log('Change turn while move pawn')
            // const gameOver = await this.checkGameTimeOverCondition(playerId);
            // if (gameOver) {
            //     resp.state = this.state
            //     this.log('Gamze over while move pawn')
            //     // return httpResp;
            // }
        }
        const httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
        this.log('user PowerCard resp=>', httpResp);
        // resp.gameMode = this.gameMode;
        // resp.gameTurnRemaining = this.gameTurnRemaining
        GameServer.Instance.socketServer.emitToSocketRoom(this.ID, "usepowercard", httpResp);
        this.sendLogInMongo('onMovePawn');
        await this.gameSync()
        return httpResp;
    }
    private async changeCurrentPlayerCoinPosition(playerId: string, pawnIndex: number, rolledIndex: number = 0,prediceValues:number=0) {
        //console.log("pawnIndex ", pawnIndex);
        //console.log("rolledIndex ", rolledIndex);
        if (this.state !== GameState.RUNNING) {
            // In case of extra hit!.
            const resp = {
                changeTurn: true,
                phase: this.phase,
                players: this.players.map(p => p.playerInfo),
                state: this.state,
                turnIndex: this.turnIndex,
                rolledValues: this.rolledValues,
                // rollTime: this.rollTime,
                // moveTime: this.moveTime,
                turnTime: this.turnTime
            }
            return resp;
        };
        if (this.phase != GamePhase.MOVE_PAWN) {
            const error = new BaseHttpResponse(null, "Invalid Phase while moving - ph - " + this.phase, 400, this.ID);
            throw error;
        }
        let diceValue;
        let previousRolledValues = [...this.rolledValues];
        this.previousRollDice = previousRolledValues;
        const newRolledValues = [];
        if(prediceValues != 0){
            this.rolledValues = [prediceValues]
            previousRolledValues = [...this.rolledValues];
        }
        for (let i = 0; i < this.rolledValues.length; i++) {
            if (i == rolledIndex) {
                diceValue = this.rolledValues[i];
            } else {
                newRolledValues.push(this.rolledValues[i]);
            }
        }
        this.rolledValues = newRolledValues;
        // const diceValue = this.rolledValues[rolledIndex];
        //console.log("diceValue", diceValue);
        const currentTurn = this.turnIndex;
        //console.log("currentTurn ", currentTurn);
        const currentPlayer: Player = this.getCurrentPlayer();
        // @Puneet
        // currentPlayer.skipped(false);
        // END
        // invalid diceValue, change turn and shift
        if (!diceValue) {
            currentPlayer.sixCounter(false);

            this.changeTurn();
            this.log(`Change turn in movePawn due to invalid dice vaalue`, diceValue)
            const resp = {
                changeTurn: true,
                phase: this.phase,
                players: this.players.map(p => p.playerInfo),
                state: this.state,
                turnIndex: this.turnIndex,
                rolledValues: previousRolledValues,
                // rollTime: this.rollTime,
                // moveTime: this.moveTime,
                turnTime: this.turnTime,
            }
            this.log(`Change turn called in changeCoinPosition of player - ${currentPlayer.ID}`, resp)
            return resp;
        } else {
            const isValid = await this.validateCoinPosition(playerId, pawnIndex, diceValue);
            if (isValid) {
                //console.log('Is valid move', isValid)
                if (isValid.coinEliminated) {
                    this.changeTurn();
                    let resp: any = {};
                    if (isValid.coinEliminated.switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.SNAKE) {
                        //for snake response
                        resp = {
                            changeTurn: true,
                            phase: this.phase,
                            players: this.players.map(p => p.playerInfo),
                            state: this.state,
                            turnIndex: this.turnIndex,
                            rolledValues: previousRolledValues,
                            // rollTime: this.rollTime,
                            // moveTime: this.moveTime,
                            turnTime: this.turnTime,
                            move: {
                                isValid: isValid,
                                playerPos: currentTurn,
                                pawnIndex: pawnIndex,
                                diceValue: diceValue,

                            },
                            kill: {
                                killed: isValid.coinEliminated
                            },
                            movePath: this.pathMaker(isValid.coinEliminated.path)

                        };
                    } else if (isValid.coinEliminated.switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.LADDER) {
                        resp = {
                            changeTurn: true,
                            phase: this.phase,
                            players: this.players.map(p => p.playerInfo),
                            state: this.state,
                            turnIndex: this.turnIndex,
                            rolledValues: previousRolledValues,
                            // rollTime: this.rollTime,
                            // moveTime: this.moveTime,
                            turnTime: this.turnTime,
                            move: {
                                isValid: isValid,
                                playerPos: currentTurn,
                                pawnIndex: pawnIndex,
                                diceValue: diceValue,
                            },
                            ladder: {
                                // killer: {
                                //     pawnIndex: pawnIndex,
                                //     playerIndex: this.currentPlayer(currentTurn).POS
                                // },
                                up: isValid.coinEliminated
                            },
                            movePath: this.pathMaker(isValid.coinEliminated.path)

                        };
                    } else if (isValid.coinEliminated.switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.POWER) {
                        resp = {
                            changeTurn: true,
                            phase: this.phase,
                            players: this.players.map(p => p.playerInfo),
                            state: this.state,
                            turnIndex: this.turnIndex,
                            rolledValues: previousRolledValues,
                            // rollTime: this.rollTime,
                            // moveTime: this.moveTime,
                            turnTime: this.turnTime,
                            move: {
                                isValid: isValid,
                                playerPos: currentTurn,
                                pawnIndex: pawnIndex,
                                diceValue: diceValue,
                            },
                            power: {
                                // killer: {
                                //     pawnIndex: pawnIndex,
                                //     playerIndex: this.currentPlayer(currentTurn).POS
                                // },
                                powerup: isValid.coinEliminated
                            },
                            movePath: this.pathMaker(isValid.coinEliminated.path),
                            powerStack: currentPlayer.getPowerStack()

                        };
                    } else {
                        //for no power response
                        resp = {
                            changeTurn: true,
                            phase: this.phase,
                            players: this.players.map(p => p.playerInfo),
                            state: this.state,
                            turnIndex: this.turnIndex,
                            rolledValues: previousRolledValues,
                            // rollTime: this.rollTime,
                            // moveTime: this.moveTime,
                            turnTime: this.turnTime,
                            move: {
                                isValid: isValid,
                                playerPos: currentTurn,
                                pawnIndex: pawnIndex,
                                diceValue: diceValue,
                            },
                            movePath: this.pathMaker(isValid.coinEliminated.path),
                            powerStack: currentPlayer.getPowerStack()

                        };
                    }

                    return resp;
                }
                if (isValid.reachedHome) {
                    const statusOfEndGame = await this.canEndTheGameForPlay()
                    // if (!this.canEndTheGameForPlay()) {
                    //     this.changeTurn();
                    // }
                    //console.log("====can end the game ========="+statusOfEndGame)
                    if (!statusOfEndGame) {
                        this.changeTurn();
                    }
                    const resp: any = {
                        changeTurn: true,
                        phase: this.phase,
                        players: this.players.map(p => p.playerInfo),
                        state: this.state,
                        turnIndex: this.turnIndex,
                        rolledValues: previousRolledValues,
                        // rollTime: this.rollTime,
                        // moveTime: this.moveTime,
                        turnTime: this.turnTime,
                        move: {
                            isValid: {
                                coinEliminated: {
                                    path: this.pathMaker(isValid.reachedHome),
                                    pawnIndex: pawnIndex,
                                    playerIndex: currentTurn,
                                    switchSnakeOrLadderOrPower: 0
                                },
                                reachedHome: true
                            },
                            playerPos: currentTurn,
                            pawnIndex: pawnIndex,
                            diceValue: diceValue
                        },
                        movePath: this.pathMaker(isValid.reachedHome)
                    };
                    this.log('Return resp reach home', resp)
                    return resp;
                } else {
                    const resp: any = {
                        changeTurn: true,
                        phase: this.phase,
                        players: this.players.map(p => p.playerInfo),
                        state: this.state,
                        turnIndex: this.turnIndex,
                        rolledValues: previousRolledValues,
                        // rollTime: this.rollTime,
                        // moveTime: this.moveTime,
                        turnTime: this.turnTime,
                        move: {
                            isValid: isValid,
                            playerPos: currentTurn,
                            pawnIndex: pawnIndex,
                            diceValue: diceValue
                        },
                        movePath: this.pathMaker(isValid)
                    };
                    this.log('Return resp reach home', resp)
                    return resp;
                }
            } else {
                this.rolledValues = previousRolledValues;
                let currentPlayer = this.getCurrentPlayer();
                this.players.forEach(async (player)=>{
                    await player.removePowerCounter();
                })
                const resp: any = {
                    changeTurn: true,
                    phase: this.phase,
                    players: this.players.map(p => p.playerInfo),
                    state: this.state,
                    turnIndex: this.turnIndex,
                    rolledValues: previousRolledValues,
                    // rollTime: this.rollTime,
                    // moveTime: this.moveTime,
                    turnTime: this.turnTime,
                    move: {
                        isValid: isValid,
                        playerPos: currentTurn,
                        pawnIndex: pawnIndex,
                        diceValue: diceValue
                    },
                };
                return resp;
            }
        }

    }
    private async usePowerCard(playerId: string, pawnIndex: number, powerIndex: number = 0, playerforIndex: string) {
        //console.log("pawnIndex ", pawnIndex);
        //console.log("rolledIndex ", powerIndex);
        if (this.state !== GameState.RUNNING) {
            // In case of extra hit!.
            const resp = {
                changeTurn: false,
                phase: this.phase,
                players: this.players.map(p => p.playerInfo),
                state: this.state,
                turnIndex: this.turnIndex,
                rolledValues: this.rolledValues,
                // rollTime: this.rollTime,
                // moveTime: this.moveTime,
                turnTime: this.turnTime
            }
            return resp;
        };
        if (this.phase != GamePhase.ROLL_DICE) {
            const error = new BaseHttpResponse(null, "Invalid Phase while moving - ph - " + this.phase, 400, this.ID);
            throw error;
        }
        const currentPlayer: Player = this.getCurrentPlayer();
        //get the power of user
        let powerUsed = 4;
        this.players.forEach((player) => {
            if (player.ID == currentPlayer.ID) {
                powerUsed = player.Powerstack[powerIndex]
            }
        })
        const currentTurn = this.turnIndex;
        //console.log("currentTurn ", currentTurn);
        let diceValue
        if (powerUsed == PowerCard.PLUSONE) {
            //plue one power
            diceValue = powerUsed
        } else if (powerUsed == PowerCard.PLUSTWO) {
            //plue two power
            diceValue = powerUsed
        } else if (powerUsed == PowerCard.MINONE) {
            //minu two power
            diceValue = powerUsed
        } else if (powerUsed == PowerCard.MINTWO) {
            //min two power
            diceValue = powerUsed
        } else {
            //plue reverse power 
            let played = this.getPlayerById(playerforIndex)
            diceValue = played.previouspawnStack[pawnIndex] - played.getPawnPosition(pawnIndex)
            this.log("The player previous value "+played.previouspawnStack[pawnIndex]+" - "+played.getPawnPosition(pawnIndex))
            this.log("The dice value on power card is "+diceValue)
        
        }
        //console.log("The dice value on power card is "+diceValue)
        this.log("The dice value on power card is "+diceValue)
        const isValid = await this.validateCoinPositionPower(playerforIndex,pawnIndex, diceValue,powerIndex)
            if (isValid) {
                //console.log('Is valid move', isValid)
                if (isValid.coinEliminated) {
                    
                    let resp: any = {};
                    if (isValid.coinEliminated.switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.SNAKE) {
                        //for snake response
                        resp = {
                            changeTurn: false,
                            phase: this.phase,
                            players: this.players.map(p => p.playerInfo),
                            state: this.state,
                            turnIndex: this.turnIndex,
                            //rolledValues: previousRolledValues,
                            // rollTime: this.rollTime,
                            // moveTime: this.moveTime,
                            turnTime: this.turnTime,
                            move: {
                                isValid: isValid,
                                playerPos: isValid.coinEliminated.playerIndex,
                                pawnIndex: pawnIndex,
                                powerUsed: powerUsed,

                            },
                            kill: {
                                killed: isValid.coinEliminated
                            },
                            movePath: this.pathMaker(isValid.coinEliminated.path)

                        };
                    } else if (isValid.coinEliminated.switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.LADDER) {
                        resp = {
                            changeTurn: false,
                            phase: this.phase,
                            players: this.players.map(p => p.playerInfo),
                            state: this.state,
                            turnIndex: this.turnIndex,
                            //rolledValues: previousRolledValues,
                            // rollTime: this.rollTime,
                            // moveTime: this.moveTime,
                            turnTime: this.turnTime,
                            move: {
                                isValid: isValid,
                                playerPos: isValid.coinEliminated.playerIndex,
                                pawnIndex: pawnIndex,
                                powerUsed: powerUsed,
                            },
                            ladder: {
                                // killer: {
                                //     pawnIndex: pawnIndex,
                                //     playerIndex: this.currentPlayer(currentTurn).POS
                                // },
                                up: isValid.coinEliminated
                            },
                            movePath: this.pathMaker(isValid.coinEliminated.path)

                        };
                    } else if (isValid.coinEliminated.switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.POWER) {
                        resp = {
                            changeTurn: false,
                            phase: this.phase,
                            players: this.players.map(p => p.playerInfo),
                            state: this.state,
                            turnIndex: this.turnIndex,
                            //rolledValues: previousRolledValues,
                            // rollTime: this.rollTime,
                            // moveTime: this.moveTime,
                            turnTime: this.turnTime,
                            move: {
                                isValid: isValid,
                                playerPos: isValid.coinEliminated.playerIndex,
                                pawnIndex: pawnIndex,
                                powerUsed: powerUsed,
                            },
                            power: {
                                // killer: {
                                //     pawnIndex: pawnIndex,
                                //     playerIndex: this.currentPlayer(currentTurn).POS
                                // },
                                powerup: isValid.coinEliminated
                            },
                            movePath: this.pathMaker(isValid.coinEliminated.path),
                            powerStack: currentPlayer.getPowerStack()

                        };
                    } else {
                        //for no power response
                        resp = {
                            changeTurn: false,
                            phase: this.phase,
                            players: this.players.map(p => p.playerInfo),
                            state: this.state,
                            turnIndex: this.turnIndex,
                            //rolledValues: previousRolledValues,
                            // rollTime: this.rollTime,
                            // moveTime: this.moveTime,
                            turnTime: this.turnTime,
                            move: {
                                isValid: isValid,
                                playerPos: isValid.coinEliminated.playerIndex,
                                pawnIndex: pawnIndex,
                                powerUsed: powerUsed,
                            },
                            movePath: this.pathMaker(isValid.coinEliminated.path),
                            powerStack: currentPlayer.getPowerStack()

                        };
                    }
                    resp.currentPower = powerUsed
                    return resp;
                }
                if (isValid.reachedHome) {
                    const playedFor = this.getPlayerById(playerforIndex)
                    const resp: any = {
                        changeTurn: false,
                        phase: this.phase,
                        players: this.players.map(p => p.playerInfo),
                        state: this.state,
                        turnIndex: this.turnIndex,
                        //rolledValues: previousRolledValues,
                        // rollTime: this.rollTime,
                        // moveTime: this.moveTime,
                        turnTime: this.turnTime,
                        move: {
                            isValid: {
                                coinEliminated: {
                                    path: this.pathMaker(isValid.reachedHome),
                                    pawnIndex: pawnIndex,
                                    playerIndex: playedFor.POS,
                                    switchSnakeOrLadderOrPower: 0
                                },
                                reachedHome: true
                            },
                            playerPos: currentTurn,
                            pawnIndex: pawnIndex,
                            powerUsed: powerUsed
                        },
                        movePath: this.pathMaker(isValid.reachedHome)
                    };
                    this.log('Return resp reach home', resp)
                    resp.currentPower = powerUsed
                    
                    return resp;
                } else {
                    
                    const resp: any = {
                        changeTurn: false,
                        phase: this.phase,
                        players: this.players.map(p => p.playerInfo),
                        state: this.state,
                        turnIndex: this.turnIndex,
                        //rolledValues: previousRolledValues,
                        // rollTime: this.rollTime,
                        // moveTime: this.moveTime,
                        turnTime: this.turnTime,
                        move: {
                            isValid: isValid,
                            playerPos: currentTurn,
                            pawnIndex: pawnIndex,
                            powerUsed: powerUsed
                        },
                        movePath: this.pathMaker(isValid)
                    };
                    this.log('Return resp reach home', resp)
                    resp.currentPower = powerUsed
                    
                    return resp;
                }
            } else {
                
                //this.rolledValues = previousRolledValues;
                //let currentPlayer = this.getCurrentPlayer();
                this.players.forEach(async (player)=>{
                    await player.removePowerCounter();
                })
                const resp: any = {
                    changeTurn: false,
                    phase: this.phase,
                    players: this.players.map(p => p.playerInfo),
                    state: this.state,
                    turnIndex: this.turnIndex,
                    //rolledValues: previousRolledValues,
                    // rollTime: this.rollTime,
                    // moveTime: this.moveTime,
                    turnTime: this.turnTime,
                    move: {
                        isValid: isValid,
                        playerPos: currentTurn,
                        pawnIndex: pawnIndex,
                        powerUsed: powerUsed
                    },
                };
                resp.currentPower = powerUsed
                    
                return resp;
            }
        // let getUpdatedPosition = await this.updatePlayerCoinPositionPower(pawnIndex, powerUsed, playerforIndex)


        //return getUpdatedPosition

    }
    private async validateCoinPosition(playerId: string, pawnIndex: number, diceValue: number): Promise < any > {
        const currentPlayer = this.currentTurnPlayer(playerId);
        const pawnPos = currentPlayer.getPawnPosition(pawnIndex);
        //console.log("pawn stack before ", currentPlayer.playerInfo.pawnStack);
        //console.log("dice value ", diceValue);
        const isValid = isValidPawnPosition(currentPlayer.POS, diceValue, pawnPos, currentPlayer.killedBefore);
        //console.log("isValid  ", isValid);
        if (isValid) {
            const resp = await this.updatePlayerCoinPosition(pawnIndex, diceValue);
            //console.log('New coin position', resp)
            if (resp && resp.coinEliminated) {
                //check snake or ladder
                if (resp.coinEliminated.switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.SNAKE) {
                    currentPlayer.updateHasKilled();
                } else if (resp.coinEliminated.switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.LADDER) {
                    currentPlayer.updateHasLadder();
                } else if (resp.coinEliminated.switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.POWER) {
                    //currentPlayer.updatePowerCounter();
                } else {
                    //do nothing
                }
                return resp;
            }
            if (resp && resp.reachedHome) {
                return resp;
            }
            return true;
            // //console.log("pawn stack after ", currentPlayer.playerInfo.pawnStack);
        } else if (!this.canMovePawn(currentPlayer.POS)) {
            console.error("\n cant move any pawn .........");
            
            return false;
        } else {
            this.rolledValues.unshift(diceValue);
            return false;
        }
    }
    private async validateCoinPositionPower(playerId: string, pawnIndex: number, diceValue: number, powerIndex:number): Promise < any > {
        const forPlayer = this.getPlayerById(playerId);
        const pawnPos = forPlayer.getPawnPosition(pawnIndex);
        //console.log("pawn stack before power", forPlayer.playerInfo.pawnStack);
        //console.log("dice value ", diceValue);
        const isValid = isValidPawnPositionPower(forPlayer.POS, diceValue, pawnPos, forPlayer.killedBefore);
        //console.log("isValid  ", isValid);
        if (isValid) {
            const currentPlayer:Player = this.getCurrentPlayer();
            await currentPlayer.removePowerStack(powerIndex)
            const resp = await this.updatePlayerCoinPositionPower(pawnIndex, diceValue,playerId,powerIndex);
            //console.log('New coin position', resp)
            if (resp && resp.coinEliminated) {
                
                //check snake or ladder
                if (resp.coinEliminated.switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.SNAKE) {
                    forPlayer.updateHasKilled();
                } else if (resp.coinEliminated.switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.LADDER) {
                    forPlayer.updateHasLadder();
                } else if (resp.coinEliminated.switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.POWER) {
                    //forPlayer.updatePowerCounter();
                } else {
                    
                    //do nothing
                }
                return resp;
            }
            if (resp && resp.reachedHome) {
                return resp;
            }
            return true;
            // //console.log("pawn stack after ", currentPlayer.playerInfo.pawnStack);
        } else if (!this.canMovePawn(forPlayer.POS)) {
            console.error("\n cant move any pawn .........");
            
            return false;
        } else {
            this.rolledValues.unshift(diceValue);
            return false;
        }
    }
    // public updateHasKilled() {
    //     //console.log("\n \n Hash Killed oppnent .......", this.ID);
    //     this.hasKilled = true;
    // }
    private async updatePlayerCoinPosition(pawnIndex: number, diceValue: number) {
        //console.log("\n updatePlayerCoinPosition position ", pawnIndex, diceValue);
        const currentPlayer = this.getCurrentPlayer();
        const playerGameFinish = currentPlayer.setCoinPosition(pawnIndex, diceValue);
        const updatedPosition = currentPlayer.getPawnPosition(pawnIndex);
        //console.log("\n updated position ", updatedPosition);
        //console.log("\n updated finish game ", playerGameFinish);
        this.log(this.ID, " Updated position ", updatedPosition)
        this.log(this.ID, " Updated finish game ", playerGameFinish);
        const coinEliminated = this.eliminateCoin(updatedPosition, false, diceValue, pawnIndex,false,currentPlayer,4);
        const reachedHome = this.isCoinReachedHome(pawnIndex);
        //console.log("\n updated coin eliminated ", coinEliminated);
        //console.log("\n reached home  ", reachedHome);

        if (coinEliminated || reachedHome) {
            if (playerGameFinish) {
                this.noPlayerReachHome++;
                let rank = this.assignRank(currentPlayer.ID, false);
                this.log(`Updateing player state on player reach home -`, rank, currentPlayer.ID)
                currentPlayer.updatePlayerState(PlayerState.WON, rank);
                this.changeTurn();
                this.log(`Change turn and Player reaches home ${currentPlayer.ID} total player in home ${this.noPlayerReachHome}`)
                if (await this.canEndGameOnPlayerReachingHome()) {

                    this.log('Game finish due to player reach home first=>', currentPlayer.ID)
                    this.state = GameState.FINISHED;
                    await this.updateRankOnReachingHome();
                    const resp = {
                        phase: this.phase,
                        players: this.players.map(p => {
                            const resp = p.playerInfo;
                            //console.log("player , ", resp);
                            return resp;
                        }),
                        state: this.state,
                        rolledValues: this.rolledValues,
                        turnIndex: this.turnIndex,
                        // rollTime: this.rollTime,
                        // moveTime: this.moveTime,
                        turnTime: this.turnTime,
                    }
                    const httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
                    //GameServer.Instance.socketServer.emitToSocketRoom(this.ID, "gameEnd", httpResp)
                    setTimeout(()=>{this.sendGameEndEvent(httpResp,this.ID)},DELAY_IN_GAME_END)
                    // return {
                    //     coinEliminated,
                    //     reachedHome
                    // };
                    
                }
            } else {
                this.turnPhase();
            }

            return {
                coinEliminated,
                reachedHome
            };
        } else if (diceValue == 6) {
            this.turnPhase();
        } else if (!this.rolledValues.length) {
            this.log(`Change turn on updateCoinPosition`)
            this.changeTurn();
        }
    }
    private async updatePlayerCoinPositionPower(pawnIndex: number, diceValue: number, playerforIndex: string, powerIndex:number) {
        //console.log("\n updatePlayerCoinPosition position ", pawnIndex, diceValue);
        const currentPlayer = this.getCurrentPlayer();
        const playedFor = this.getPlayerById(playerforIndex)
        const playerGameFinish = playedFor.setCoinPosition(pawnIndex, diceValue);
        const updatedPosition = playedFor.getPawnPosition(pawnIndex);
        //console.log("\n updated position ", updatedPosition);
        //console.log("\n updated finish game ", playerGameFinish);
        this.log(this.ID, " Updated position ", updatedPosition)
        this.log(this.ID, " Updated finish game ", playerGameFinish);
        const IsPower = true
        const coinEliminated = this.eliminateCoin(updatedPosition, false, diceValue, pawnIndex,IsPower,playedFor,powerIndex);
        const reachedHome = this.isCoinReachedHomePower(pawnIndex,playerforIndex);
        //console.log("\n updated coin eliminated ", coinEliminated);
        //console.log("\n reached home  ", reachedHome);

        if (coinEliminated || reachedHome) {
            if (playerGameFinish) {
                this.noPlayerReachHome++;
                let rank = this.assignRank(playedFor.ID, false);
                this.log(`Updateing player state on player reach home -`, rank, currentPlayer.ID)
                playedFor.updatePlayerState(PlayerState.WON, rank);
                this.changeTurn();
                this.log(`Change turn and Player reaches home ${playedFor.ID} total player in home ${this.noPlayerReachHome}`)
                if (await this.canEndGameOnPlayerReachingHome()) {

                    this.log('Game finish due to player reach home first=>', playedFor.ID)
                    this.state = GameState.FINISHED;
                    await this.updateRankOnReachingHome();
                    const resp = {
                        phase: this.phase,
                        players: this.players.map(p => {
                            const resp = p.playerInfo;
                            //console.log("player , ", resp);
                            return resp;
                        }),
                        state: this.state,
                        rolledValues: this.rolledValues,
                        turnIndex: this.turnIndex,
                        // rollTime: this.rollTime,
                        // moveTime: this.moveTime,
                        turnTime: this.turnTime,
                    }
                    const httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
                    //GameServer.Instance.socketServer.emitToSocketRoom(this.ID, "gameEnd", httpResp)
                    setTimeout(()=>{this.sendGameEndEvent(httpResp,this.ID)},DELAY_IN_GAME_END)
                    // return {
                    //     coinEliminated,
                    //     reachedHome
                    // };

                    
                }
            } else {
                this.turnPhase();
            }

            return {
                coinEliminated,
                reachedHome
            };
        } else if (diceValue == 6) {
            this.turnPhase();
        } else if (!this.rolledValues.length) {
            this.log(`Change turn on updateCoinPosition`)
            this.changeTurn();
        }
    }
    private async updateRankOnReachingHome() {
        const userPrizes = await this.getContestPrize();
        this.log(`User prizes are(onReachHome)`, userPrizes)
        const players = this.players.map(p => p.playerInfo).sort((a, b) => b.score - a.score);
        players.forEach(player => {
            let isExitPlayer = player.isExitPlayer
            const rank = this.assignRank(player.userId, isExitPlayer);
            const getPlayer = this.currentPlayer(player.pos);
            let state = isExitPlayer ? player.state : PlayerState.WON
            this.log('Updating payer state on gamend on player reach home ', getPlayer.ID, state, rank, userPrizes[getPlayer.MID])
            getPlayer.updatePlayerState(state, rank, userPrizes[getPlayer.MID]);
        });
    }
    private async canEndGameOnPlayerReachingHome(): Promise < boolean > {
        this.log(`Checking game can end on player reaching home?`, this.noOfContestWinner, this.noPlayerReachHome, this.canEndTheGame());
        // if (this.capacity == 2) {
        //     if (this.noOfContestWinner != this.noPlayerReachHome && !this.canEndTheGame()) {
        //         this.log(`No game cannot end`);
        //         return false
        //     }
        //     this.log(`no of player reach home ${this.noPlayerReachHome} No of winner ${this.noOfContestWinner}`)
        // }
        this.log(`Yes game can end`);
        return true;
    }
    public isCoinReachedHome(pawnIndex: number): any {
        // if (this.checkCurrentPlayerWon()) {
        //     this.log('turnChange called current playr won', this.getCurrentPlayer().ID)
            
        //     return true;
        // }
        const currentPlayer = this.getCurrentPlayer();
        const position = currentPlayer.getPawnPosition(pawnIndex);
        if (position === 64) {
            const remainPath = getRange(currentPlayer.previouspawnStack[pawnIndex], position)


            return remainPath;
        }
        return false;
    }
    public isCoinReachedHomePower(pawnIndex: number,playerFor:string): any {
        if (this.checkCurrentPlayerWon()) {
            this.log('turnChange called current playr won', this.getCurrentPlayer().ID)
            
            return true;
        }
        const currentPlayer = this.getPlayerById(playerFor);
        const position = currentPlayer.getPawnPosition(pawnIndex);
        if (position === 64) {
            const remainPath = getRange(currentPlayer.previouspawnStack[pawnIndex], position)


            return remainPath;
        }
        return false;
    }

    private checkCurrentPlayerWon() {
        const currentPlayer = this.getCurrentPlayer();
        return currentPlayer.hasWon;
    }
    public eliminateCoin(position: number, dryRun: boolean = false, diceValue: number, pawnIndex: number, IsPower:boolean,playerfor:Player,powerIndex:number): any {
        // if (isSafePosition(position)) {
        //     //console.log("cant eliminate as its s safe cell");
        //     return false;
        // }
        if (this.killedBySnakeOrPower(position)) {
            //console.log("\n player pawn mat with snake, ladder or the power card now ");
            // Update kill only when dryRun is false;
            //return dryRun ? true : this.resetPlayerCoin(position);
            return dryRun ? true : this.resetPlayerCoinSnake(position, diceValue, pawnIndex,IsPower,playerfor,powerIndex);
            //return false;
        }
        return false;
    }
    private resetPlayerCoinSnake(pawnPos: number, diceValue: number, pawnIndex: number,Ispower:boolean,playerFor:Player,powerIndex:number): any {
        this.log("pawnPosition for update pawn is " + pawnPos)
        //const currentPlayer = this.getCurrentPlayer();
        const SnakeAndLadderAndPower = this.getSnakePostion(pawnPos,pawnIndex,Ispower,powerIndex)
        let player:Player = playerFor
        const killed: any = {
            pawnIndex: pawnIndex,
            playerIndex: player.POS,
            switchSnakeOrLadderOrPower: 0,
            path: []
        }
        if (SnakeAndLadderAndPower.length == 0) {

            return;
        }

        if (SnakeAndLadderAndPower[0].switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.SNAKE) {
            killed.pawnIndex = player.eliminateCoinBySnakeAndLadder(pawnPos, SnakeAndLadderAndPower[0].snakeTail, diceValue);
        }
        if (SnakeAndLadderAndPower[0].switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.LADDER) {
            killed.pawnIndex = player.eliminateCoinBySnakeAndLadder(pawnPos, SnakeAndLadderAndPower[0].ladderHead, diceValue);
        }
        if (SnakeAndLadderAndPower[0].switchSnakeOrLadderOrPower == SwitchSnakeOrLadderOrPower.POWER) {
            let getPower = this.getPowerCard(player,pawnPos)
            killed.pawnIndex = player.updatePowerStack(pawnPos, getPower);
            player.CurrentPower = getPower;
            this.log("player get power on position "+pawnPos+" and current power is " + player.CurrentPower)
            this.log("pawnPosition for pawn power Stack " + player.getPowerStack())
            console.log("====new power======="+getPower)
            
            //remove the power card from powerCard and powercard path
            // if(this.PowerCard.indexOf(pawnPos) != -1){
            //     this.log("Power card array before remove => "+this.PowerCard)
            //     //remove card
            //     let index =this.PowerCard.indexOf(pawnPos)
            //     this.PowerCard.splice(index, 1);
            //     this.PowerCardPath.splice(index,1);
            //     this.log("Power card array after remove => "+this.PowerCard)
            //     this.log("Power card path array after remove => "+this.PowerCardPath)
            // }
        }
        killed.switchSnakeOrLadderOrPower = SnakeAndLadderAndPower[0].switchSnakeOrLadderOrPower
        if (SnakeAndLadderAndPower[0].path) {
            killed.path = this.pathMaker(SnakeAndLadderAndPower[0].path);
        } else {
            killed.path = SnakeAndLadderAndPower[0].path;
        }
        this.log(this.ID, "pawn killed and position upadte by ", killed)
        return killed;
    }
    private getPowerCard(player:Player,pawnPos: number) {
        // return 0
        let index = this.PowerCard.indexOf(pawnPos)                                                                 

        //let powerCan = this.PowerCan[index]
        let powerCan = this.getPowerRandom(player,this.PowerCan[index],0)
        this.log("we got the power " + powerCan)
        console.log("we got the power " + powerCan)
        return powerCan;
    }
    private getPowerRandom(player:Player,power:number,i:number):any{
        let val = player.Powerstack.includes(power)
        if(val){
            i++;
            return this.getPowerRandom(player,this.PowerCan[i],i)
        }
        else{
            return power;
            
        }
    }
    private resetPlayerCoin(pawnPos: number): any {
        const currentPlayer = this.getCurrentPlayer();
        const coins = this.getAllCoinsAtPosition(pawnPos, true);
        //If a position has more than 2 pawns of any player then the position is safe
        if (coins.length == 2) {
            this.log('Pawn kill safe due to there is no snake head');
            return
        }
        const doublingTokens = this.checkDoubling(pawnPos);
        //console.log("\n \n Doubling token response ", doublingTokens);
        const enemyPlayer = coins.find(
            (coin) => coin.playerId !== currentPlayer.ID
        );
        if (enemyPlayer) {
            const player = this.players.find((x) => x.ID === enemyPlayer.ID);
            if (doublingTokens.has(player.POS) && doublingTokens.get(player.POS) >= 2) {
                //console.log("\n This token is safe !!!!!", player.POS);
                return;
            }
            const killed: any = {
                pawnIndex: pawnPos,
                playerIndex: 1
            }
            killed.pawnIndex = player.eliminateCoin(pawnPos);
            killed.playerIndex = player.POS;
            return killed;

        }
    }
    private checkDoubling(position: number): Map < number, number > {
        let playerPositions: Map < number, number > = new Map();
        this.players.forEach(player => {
            player.getPawnStack().forEach((pawnPosition: number, pawnIndex: number) => {
                if (position == pawnPosition) {
                    if (playerPositions.has(player.POS)) {
                        playerPositions.set(player.POS, playerPositions.get(player.POS) + 1);
                    } else {
                        playerPositions.set(player.POS, 1);
                    }
                }
            })
        });
        return playerPositions;
    }
    private canAttack(pawnPos: number): any {
        const coins = this.getAllCoinsAtPosition(pawnPos);
        return coins.length === 1;
    }
    private killedBySnakeOrPower(pawnPos: number): any {
        if (this.SnakeHead.includes(pawnPos) || this.LadderTail.includes(pawnPos) || this.PowerCard.includes(pawnPos)) {
            return true;
        } else {
            return true;
        }
    }
    private currentTurnPlayer(playerId: string): Player {
        //console.log("\n currentTurnPlayer Turn of ", this.turnIndex);
        //console.log("\n currentTurnPlayer playerId  ", playerId);
        const index = this.players.findIndex(p => p.ID == playerId);
        if (index == -1) {
            //console.log("\n currentTurnPlayer players array  ", this.printPlayerArr());
        }
        //console.log("\n Turn input by ", index);
        return this.players[index];
        if (this.phase != GamePhase.ROLL_DICE) throw Error("Invalid Phase");
        if (this.turnIndex != index) throw Error("Not your Turn");
        return this.players[index];
    }

    private generateRandomWeightage(n: number, weightage: number = 100) {
        let randomArray = []
        for (let i = 0; i < n; i++) {
            let randomPercent = Math.ceil(Math.random() * 100);
            if (randomPercent > weightage) {
                randomArray.push(Math.floor(Math.random() * (5 - 4 + 1) + 4))
                // randomArray.push(Math.floor(3))
            } else {
                randomArray.push(Math.ceil(Math.random() * 5))
                //randomArray.push(Math.floor(3))
            }
        }
        return randomArray;
    }
    private shuffle(array: Array < number > ) {
        let currentIndex = array.length,
            randomIndex;

        // While there remain elements to shuffle.
        while (currentIndex != 0) {
            // Pick a remaining element.
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;

            // And swap it with the current element.
            [array[currentIndex], array[randomIndex]] = [
                array[randomIndex], array[currentIndex]
            ];
        }

        return array;
    }

    private restartTurnTimeout() {
        const diff = Date.now() - this.lastTurnTimeMilli;
        let turnTimeRemaining = (diff > this.turnTime) ? this.turnTime : diff;
        this.startTurnPhaseTimer(turnTimeRemaining);

    }
    private startTurnPhaseTimer(turnTimeRemaining: number = null) {
        this.log("startTurnPhaseTimer : Starting Turn Phase Timer");
        this.clearAllTimeouts();
        this.timeout = setTimeout(this.onTurnPhaseTimeout.bind(this), turnTimeRemaining || this.turnTime);
    }
    private clearAllTimeouts() {
        clearTimeout(this.timeout);
    }
    private async onTurnPhaseTimeout() {
        // if (this.phase !== GamePhase.ROLL_DICE) {
        //     //console.log("onRollingPhaseTimeout : Cant clear time out as phase is not roll dice");
        // }
        const currentPlayer = this.getCurrentPlayer();
        //currentPlayer.sixCounter(false);

        // currentPlayer.skipped(true);
        const flag = await this.handleAutoExit(currentPlayer);
        if (flag == true) return;
        //console.log("onTurnPhaseTimeout : Clearing time-outs ");
        this.clearAllTimeouts();
        this.changeTurn();
        //await this.checkGameTimeOverCondition(currentPlayer.ID);
        const resp = {
            autoMove: true,
            changeTurn: true,
            phase: this.phase,
            players: this.players.map(p => p.playerInfo),
            state: this.state,
            turnIndex: this.turnIndex,
            rolledValues: this.rolledValues,
            // rollTime: this.rollTime,
            // moveTime: this.moveTime,
            turnTime: this.turnTime,
            skip: {
                turnIndex: currentPlayer.POS,
                reason: TURN_SKIP_REASON.TURN_TIMEOUT
            },
            gameMode: this.gameMode,
            gameTurnRemaining: this.gameTurnRemaining
        }

        const httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
        this.sendLogInMongo('onRollingTimeout');
        //this.log(`changeTurn called on rollingPhaseTimeout of player - ${currentPlayer.ID}`, httpResp)
        //this.log(`Rolling phase timeout for ${currentPlayer.ID} call rollDice`, httpResp)
        GameServer.Instance.socketServer.emitToSocketRoom(this.ID, "rollDice", httpResp);

    }
    changeTurn() {
        this.turnStartTime = Date.now()
        //console.log("\n \n ......Change Turn Called ..................start ");
        if (this.state !== GameState.RUNNING) {
            this.clearAllTimeouts();
            console.error("\n Game not in running state \n ", this.state);
            return;
        }
        let turnIndices: number;
        this.players.forEach((player, pindex) => {
            if (player.POS == this.turnIndex) {
                turnIndices = pindex;
            }
        })
        const nextTurnIndex = turnIndices + 1;
        const normalisedIndex = nextTurnIndex % this.players.length;
        //console.log("\n \n normalisedIndex nextplayer ", normalisedIndex);
        const nextPlayer = this.players[normalisedIndex];
        this.log(`Changing turn from player ${this.turnIndex} to ${nextTurnIndex} = ${normalisedIndex}`)
        //console.log("\n \n normalisedIndex nextplayer isplaying ", nextPlayer.isPlaying);

        this.turnIndex = nextPlayer.POS;
        //console.log("turn Index ", this.turnIndex);
        //console.log("\n ......Change Turn Called ..................end ");
        // if ( this.gameMode == GameMode.TURN_BASED &&normalisedIndex == 0) {
        //     this.gameTurnRemaining -= 1;
        //     if (this.gameTurnRemaining <= 0) {
        //         this.onGameCountDownTimeout()
        //     }
        // }
        if (!nextPlayer.isPlaying) {
            this.log(`changeTurn called on changeTurn bcz next player is not isPlaying`, nextPlayer)
            this.changeTurn();
        }
        this.rolledValues = [];
        this.turnPhase();

        let currentPlayer = this.getCurrentPlayer();
        if (currentPlayer.isXFac) {
            this.log('Currenplayer is xfac in change turn', currentPlayer)
            currentPlayer.xfac.makeMove();
        }
    }

    private turnPhase() {
        this.updateLastTurnTime();
        this.phase = GamePhase.ROLL_DICE;
        this.startTurnPhaseTimer();
    }
    private updateLastTurnTime() {
        this.lastTurnTimeMilli = Date.now();
    }

    private async handleAutoExit(currentPlayer: Player): Promise < any > {
        const missed = currentPlayer.skipped(true);
        if (missed >= 3) {
            const resp = await this.onExitGame(currentPlayer.ID, PlayerState.AUTOEXIT, ExitReason.TURN_SKIP_3);
            if (resp.state == GameState.FINISHED) {
                this.log(`Game end due to 3 skips count ${missed}`, currentPlayer.ID, resp)
                return true;
            }
        }

        return false;
    }
    public getCurrentPlayer() {
        for (let index = 0; index < this.players.length; index++) {
            if (this.players[index].POS == this.turnIndex) {
                return this.players[index];
            }
        }
    }

    public updateScore(playerId: string, score: number) {
        if (this.state != GameState.RUNNING) {
            const error = new BaseHttpResponse(null, "Game not in running state !" + this.state, 400, this.ID);
            return error;
        }
        let player = this.getPlayerById(playerId);
        player.SCORE = score;
        let resp = {
            _id: this._id,
            players: this.players.map(p => p.scoreInfo),
            playedBy: playerId
        }
        //console.log('Resp of score update', resp);
        let httpResp = new BaseHttpResponse(resp, null, 200, this.ID)
        this.emit(httpResp, 'updateScore');
        this.sendLogInMongo('updateScore', playerId)
        this.gameSyncInRedis()
        return httpResp;
    }
    public getAllCoinsAtPosition(position: number, includeCurrentPlayer = false): Array < any > {
        let arr: any = [];
        this.players.forEach((player, playerIndex) => {
            if (!player.isPlaying) {
                return
            }
            const p: any = {
                playerPos: player.POS,
                playerId: player.ID
            };
            //console.log("check kill at position ", position);
            //console.log("playerindex ");
            player.getPawnStack().forEach((pawnPosition, pawnIndex) => {
                if (pawnPosition == position && position != WINNING_POSITION) {
                    if (!includeCurrentPlayer && this.getCurrentPlayer().ID == player.ID) {
                        return
                    }
                    //console.log("found pawnPosition ", pawnPosition);
                    //console.log("found pawnIndex ", pawnIndex);
                    p.pawnPosition = pawnPosition;
                    p.pawnIndex = pawnIndex;
                    arr.push(p);
                }
            });
        });
        //console.log("arr", arr);
        return arr;
    }
    public getSnakePostion(position: number, pawnIndexUp:number, IsPower:boolean,powerIndex:number,includeCurrentPlayer = false): Array < any > {
        let arr: any = []; 
        let count = 0;
        this.players.forEach((player, playerIndex) => {
            if (!player.isPlaying) {
                return
            }
            const p: any = {
                playerPos: player.POS,
                playerId: player.ID
            };
            if (this.getCurrentPlayer().ID != player.ID && IsPower == false) {
                this.log('Cuurent player id=', this.getCurrentPlayer().ID, ' Player id=', player.ID)
                return;
            }
            this.log("check kill at position ", position);
            //console.log("playerindex ");
            count =0;
            player.getPawnStack().forEach((pawnPosition, pawnIndex) => {
                if (pawnPosition == position && position != WINNING_POSITION && pawnIndex==pawnIndexUp) {
                    count++;
                    this.log("Number of Pawn in Same Index ==" + count)
                    if (this.getCurrentPlayer().ID != player.ID && IsPower == false) {
                        this.log('Cuurent player id=', this.getCurrentPlayer().ID, ' Player id=', player.ID)
                        return;
                    } else {
                        // if(count == 2){
                        //     //console.log("two Player changes")
                        // }
                        let powerUser:number = player.GET_POWERUSED();
                        this.log("power Used is == "+powerUser)

                                
                        this.log("Path genrator previous stack ",player.previouspawnStack[pawnIndex], " new position ", player.getPawnStack()[pawnIndex] )
                            
                        let getSnakeIndex = this.SnakeHead.indexOf(position)
                        let getLadderIndex = this.LadderTail.indexOf(position)
                        let getPowerCard = this.PowerCard.indexOf(position)
                        this.log("changes in power card position", this.SnakeHead, this.LadderTail, this.PowerCard, position)
                        if (getSnakeIndex != -1) {
                            this.log("Snake is present at position " + getSnakeIndex)
                            this.log("found pawnPosition ", pawnPosition);
                            this.log("found pawnIndex ", pawnIndex);
                            p.pawnPosition = pawnPosition;
                            p.pawnIndex = pawnIndex;
                            p.snakeTail = this.SnakeTail[getSnakeIndex];
                            p.snakeHead = this.SnakeHead[getSnakeIndex];
                            p.switchSnakeOrLadderOrPower = SwitchSnakeOrLadderOrPower.SNAKE
                            if(IsPower){
                                this.log("power event come on snake position and power is "+powerUser,+"  "+p.snakeHead)
                                if((player.getPawnStack()[pawnIndex]-player.previouspawnStack[pawnIndex] )<0){
                                    if(powerUser== PowerCard.REVERSE){
                                        p.path = [player.previouspawnStack[pawnIndex]]
                                    }
                                    if(powerUser== PowerCard.MINONE){
                                        p.path = [p.snakeHead]
                                    }
                                     if(powerUser== PowerCard.MINTWO){
                                        p.path = getRange(this.SnakeHead[getSnakeIndex]-1,player.previouspawnStack[pawnIndex])
                                        p.path.pop();
                                        p.path.reverse();
                                    }
                                }
                                else{
                                    if(powerUser== PowerCard.REVERSE){
                                        p.path = [player.previouspawnStack[pawnIndex]]
                                    }
                                    else{
                                        p.path = getRange(player.previouspawnStack[pawnIndex], this.SnakeHead[getSnakeIndex])
                                    }
                                }
                                
                            }
                            else{
                                p.path = getRange(player.previouspawnStack[pawnIndex], this.SnakeHead[getSnakeIndex])
                            }
                            if (this.SnakeHead[getSnakeIndex] == SnakePath.FIRST) {
                                this.Snake1.forEach((element) => {
                                    p.path.push(element)
                                })
                            }
                            if (this.SnakeHead[getSnakeIndex] == SnakePath.SECOND) {
                                this.Snake2.forEach((element) => {
                                    p.path.push(element)
                                })
                            }
                            if (this.SnakeHead[getSnakeIndex] == SnakePath.THIRD) {
                                this.Snake3.forEach((element) => {
                                    p.path.push(element)
                                })
                            }
                            // if (this.SnakeHead[getSnakeIndex] == SnakePath.FORTH) {
                            //     this.Snake4.forEach((element) => {
                            //         p.path.push(element)
                            //     })
                            // }
                            p.path.push(this.SnakeTail[getSnakeIndex])
                            arr.push(p);
                        } else if (getLadderIndex != -1) {
                            this.log("Ladder is present at position " + getLadderIndex)
                            this.log("found pawnPosition ", pawnPosition);
                            this.log("found pawnIndex ", pawnIndex);
                            p.pawnPosition = pawnPosition;
                            p.pawnIndex = pawnIndex;
                            p.ladderTail = this.LadderTail[getLadderIndex];
                            p.ladderHead = this.LadderHead[getLadderIndex];
                            p.switchSnakeOrLadderOrPower = SwitchSnakeOrLadderOrPower.LADDER
                            if(IsPower){
                                if((player.getPawnStack()[pawnIndex]-player.previouspawnStack[pawnIndex] )<0){
                                    if(powerUser== PowerCard.REVERSE){
                                        p.path = [player.previouspawnStack[pawnIndex]]
                                    }
                                    if(powerUser== PowerCard.MINONE){
                                        p.path = [this.LadderTail[getLadderIndex]]
                                    }
                                     if(powerUser== PowerCard.MINTWO){
                                        p.path = getRange(this.LadderTail[getLadderIndex]-1,player.previouspawnStack[pawnIndex])
                                        p.path.pop();
                                        p.path.reverse();
                                    }
                                }
                                else{
                                    if(powerUser== PowerCard.REVERSE){
                                        p.path = [player.previouspawnStack[pawnIndex]]
                                    }
                                    else{
                                        p.path = getRange(player.previouspawnStack[pawnIndex], this.LadderTail[getLadderIndex])
                                    }
                                }
                                
                            }
                            else{
                                p.path = getRange(player.previouspawnStack[pawnIndex], this.LadderTail[getLadderIndex])
                            }
                            p.path.push(this.LadderHead[getLadderIndex])
                            arr.push(p);
                        } else if (getPowerCard != -1) {
                            this.log("Power is present at position " + getPowerCard)
                            this.log("found pawnPosition ", pawnPosition);
                            this.log("found pawnIndex ", pawnIndex);
                            p.pawnPosition = pawnPosition;
                            p.pawnIndex = pawnIndex;
                            p.switchSnakeOrLadderOrPower = SwitchSnakeOrLadderOrPower.POWER
                            if(IsPower){

                                if((player.getPawnStack()[pawnIndex]-player.previouspawnStack[pawnIndex] )<0){
                                    if(powerUser== PowerCard.REVERSE){
                                        p.path = [player.previouspawnStack[pawnIndex]]
                                    }
                                    if(powerUser== PowerCard.MINONE){
                                        p.path = [player.previouspawnStack[pawnIndex]-1]
                                    }
                                    if(powerUser== PowerCard.MINTWO){
                                        p.path = getRange(player.getPawnStack()[pawnIndex]-1,player.previouspawnStack[pawnIndex])
                                        p.path.pop();
                                        p.path.reverse();
                                    }
                                    else{
                                        p.path = getRange(player.getPawnStack()[pawnIndex],player.previouspawnStack[pawnIndex])
                                        p.path = p.path.reverse()
                                    }
                                }else{
                                    if(powerUser== PowerCard.REVERSE){
                                        p.path = [player.previouspawnStack[pawnIndex]]
                                    }
                                    else{
                                        p.path = getRange(player.previouspawnStack[pawnIndex], player.getPawnStack()[pawnIndex])
                                    }
                                }
                                
                            }
                            else{
                                p.path = getRange(player.previouspawnStack[pawnIndex], player.getPawnStack()[pawnIndex])
                            }
                            
                            arr.push(p);
                        } else {
                            //console.log(" nothing is present at position " + getLadderIndex + " " + getSnakeIndex + " " + getPowerCard)
                            this.log(" nothing is present at position " + getLadderIndex + " " + getSnakeIndex + " " + getPowerCard)
                            this.log("found pawnPosition ", pawnPosition);
                            this.log("found pawnIndex ", pawnIndex);
                            p.pawnPosition = pawnPosition;
                            p.pawnIndex = pawnIndex;
                            p.switchSnakeOrLadderOrPower = SwitchSnakeOrLadderOrPower.NOTHING
                            this.log("dice value in game be ",player.getPawnStack()[pawnIndex]+"-"+player.previouspawnStack[pawnIndex])
                            if(IsPower){
                                if((player.getPawnStack()[pawnIndex]-player.previouspawnStack[pawnIndex] )<0){
                                    if(powerUser== PowerCard.REVERSE){
                                        p.path = [player.previouspawnStack[pawnIndex]]
                                    }
                                    if(powerUser== PowerCard.MINONE){
                                        p.path = [player.previouspawnStack[pawnIndex]-1]
                                    }
                                     if(powerUser== PowerCard.MINTWO){
                                        p.path = getRange(player.getPawnStack()[pawnIndex]-1,player.previouspawnStack[pawnIndex])
                                        p.path.pop();
                                        p.path.reverse();
                                    }
                                    
                                }
                                else{
                                    if(powerUser== PowerCard.REVERSE){
                                        p.path = [player.previouspawnStack[pawnIndex]]
                                    }
                                    else{
                                        p.path = getRange(player.previouspawnStack[pawnIndex], player.getPawnStack()[pawnIndex])
                                    }
                                }
                            }
                            else{
                                p.path = getRange(player.previouspawnStack[pawnIndex], player.getPawnStack()[pawnIndex])
                            }
                            
                            
                            arr.push(p);
                        }
                        //console.log("arr", arr);
                        //return arr;
                    }

                }
            });
        });
        //console.log("arr", arr);
        return arr;
    }
   

    public async onExitGame(playerId: string, playerState = PlayerState.EXIT, reason: number): Promise < any > {
        var resp = {}
        this.log("Player exit from game reason -", reason);
        const exitPlayer = this.players.filter(player => player.ID == playerId);
        if (exitPlayer && exitPlayer.length == 0) {
            console.error("Player Id doesnt exits ", playerId);
            return false
        }
        this.log(`Updateing player state on exit -`, playerState, exitPlayer[0].ID)
        const exit: boolean = exitPlayer[0].updatePlayerState(playerState);
        exitPlayer[0].removePawnFromBoard();
        const gameOver = this.isGameOver();
        //console.log("exit gameOver gameOver ", gameOver);
        // Case when player exit and game over!
        if (gameOver) {
            this.log(`Game end because of exit reason - ${reason}`)
            this.state = GameState.FINISHED;
            const userPrizes = await this.getContestPrize();
            this.log(`User prizes are - `, userPrizes)
            const players = this.players.map(p => p.playerInfo).sort((a, b) => b.score - a.score);
            players.forEach(player => {
                let isExitPlayer = player.isExitPlayer
                const rank = this.assignRank(player.userId, isExitPlayer);
                //console.log("exit rank rank ", rank);
                const getPlayer = this.currentPlayer(player.pos);
                let state = isExitPlayer ? player.state : PlayerState.WON
                this.log(`Updateing player state on game end on exit player -`, getPlayer.ID, state, rank, userPrizes[getPlayer.MID])
                getPlayer.updatePlayerState(state, rank, userPrizes[getPlayer.MID]);
            });
            await this.onGameEnd();
        }
        this.log('Player exit successfully', exitPlayer[0].ID)
        resp = {
            phase: this.phase,
            players: this.players.map(p => p.playerInfo),
            state: this.state,
            turnIndex: this.turnIndex,
            rolledValues: this.rolledValues,
            // rollTime: this.rollTime,
            // moveTime: this.moveTime
            turnTime: this.turnTime,
        }
        var httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
        GameServer.Instance.socketServer.emitToSocketRoom(this.ID, "exitGame", httpResp);

        // If player self exit and game not end than chanage turn also.
        if (reason == ExitReason.GAME_EXIT && !gameOver && this.turnIndex == exitPlayer[0].POS) {
            //console.log("Change turn in case of player self exit")
            this.log('Change turn in case of player self exit', exitPlayer[0].ID)
            this.changeTurn();

            resp = {
                autoMove: true,
                changeTurn: true,
                phase: this.phase,
                players: this.players.map(p => p.playerInfo),
                state: this.state,
                turnIndex: this.turnIndex,
                rolledValues: this.rolledValues,
                turnTime: this.turnTime,
                gameMode: this.gameMode,
                gameTurnRemaining: this.gameTurnRemaining
            }
            var httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
            this.log(`Send rollDice on playerexit ${exitPlayer[0].ID}`, httpResp);
            //console.log("Send rollDice on playerexit " + exitPlayer[0].ID, httpResp)
            GameServer.Instance.socketServer.emitToSocketRoom(this.ID, "rollDice", httpResp);
        }

        this.sendLogInMongo('onPlayerExit');
        return resp
    }
    private currentPlayer(playerIndex: number): Player {
        for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].POS == playerIndex) {
                return this.players[i];
            }
        }
        // return this.players[playerIndex];
    }
    private isGameOver(): boolean {
        const playerOver = this.canEndTheGame();
        return playerOver;
    }
    private canEndTheGame(): boolean {
        const playing = this.players.filter(p => p.isPlaying).length;
        if (playing == 1) {
            return true; // yes end the game 
        }
        return false; // dont end yet
    }
    private async canEndTheGameForPlay(): Promise<any> {
        let countHomeplayer=0;
        for (let index = 0; index < this.players.length; index++) {
            let getPawnStack = this.players[index].getPawnStack();
            for (let index1 = 0; index1 < getPawnStack.length; index1++) {
                if(getPawnStack[index1]===64){
                    countHomeplayer++;
                }
            }
            countHomeplayer=0;
        }
        if(countHomeplayer == 2){
            return true; //can end the game
        }
        else{
            return false; // can't end the game
        }
        
    }
    public async onGameSync(playerId: string) {
        const diff = Date.now() - this.gameStartTime;
        let gameTimeRemain = (diff > this.gameTime) ? this.gameTime : diff;
        gameTimeRemain = this.gameTime - gameTimeRemain;
        const diffTurn = Date.now() - this.turnStartTime;
        let turnTimeRemain = (diffTurn > this.turnTime) ? this.turnTime : diffTurn;
        turnTimeRemain = this.turnTime - turnTimeRemain;
        console.log("game turn time Remaining............", turnTimeRemain||TURN_TIME);
        //this.turnIndex = await this.getCurrentTurnIndex(this.turnIndex)
        return {
            _id: this.ID,
            players: this.players.map(p => p.playerInfo),
            capacity: this.capacity,
            isFull: this.isFull,
            state: this.state,
            phase: this.phase,
            isRunning: this.isRunning(),
            gameTimeRemaining: gameTimeRemain,
            gameTime: this.gameTime,
            roomId: this.roomId ? this.roomId : '',
            gameStartIn: DELAY_IN_GAME_START - DELAY_IN_PRE_GAME_START,
            gameStartTime: this.gameStartTime,
            gameTurnRemaining: this.gameTurnRemaining,
            turnTime: TURN_TIME,
            timeRemaining:turnTimeRemain||TURN_TIME,
            turnIndex: this.turnIndex,
            SnakeHead: this.SnakeHead,
            SnakeTail: this.SnakeTail,
            LadderHead: this.LadderHead,
            LadderTail: this.LadderTail,
            rolledValues:this.rolledValues,
            previousRollDice: this.previousRollDice,
            PowerCard: this.PowerCard,
            PowerCardPath: this.PowerCardPath,
            PowerCan: this.PowerCan,
            movePath: ["01"]
        };
    }

    public async join(playerOpts: PlayerOpts, contestData: ContestData, gameLevel: GameLevel = GameLevel.NORMAL, xFacId: string = null): Promise < any > {
        let isRunning: boolean = false;
        let joiningSuccess: boolean = false;
        if (this.canJoin(playerOpts._id)) {
            if(this.players.length==0){
                playerOpts.color=1;
                playerOpts.pos=0
            }
            else{
                playerOpts.color=2;
                playerOpts.pos=1
            }
            const newPlayer = new Player(playerOpts);
            this.players.push(newPlayer);
            isRunning = this.onFullTable();
            this.gameLevel = gameLevel;
            this.xFacId = xFacId
            joiningSuccess = true
            
        }
        //this.printPlayerArr();
        let resp = {
            _id: this._id,
            players: this.players.map(p => p.playerInfo),
            capacity: this.capacity,
            isFull: this.isFull,
            state: this.state,
            isRunning: isRunning,
            timeRemaining: -1,
            gameTime: this.gameTime,
            roomId: this.roomId,
            joiningSuccess: joiningSuccess,
            // waitingTime: contestData.GameStartInSeconds * 1000
        };
        if (resp.joiningSuccess == true) {
            const httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
            this.log(`Joining success of user ${playerOpts.name} call matchInit on room. Game is running ${isRunning}`, httpResp)
            //this.joinRoom(this.ID)
            this.emit(httpResp, 'matchInit')
            if (isRunning) {
                //console.log("prestart --", contestData)
                //setTimeout(async ()=>{await this.onPreGameStart(contestData)},10000);
                await this.onPreGameStart(contestData)
            }
        }
        return resp
    }

    private async onPreGameStart(contestData: ContestData) {
        try {
            const deductBalanceResponse: JoinContestResponse = await GameServer.Instance.TransactionMethods.JoinContest(this.getTransactionData())
            this.log(`Deductig balance before start game`, deductBalanceResponse, deductBalanceResponse.RoomId);
            // await ServerService.Instance.addGame(deductBalanceResponse.RoomId.toString())
            this.roomId = deductBalanceResponse.RoomId


            const redisData: any = this.redisStartGameData();
            this.sendLogInMongo('preStartGame');
            const response = await GameServer.Instance.GameServices.createGameEntryOnStart(redisData);
            //console.log("resp after updating....", response);
            this.players.sort(function (a: Player, b: Player) {
                var keyA = a.POS,
                    keyB = b.POS;
                // Compare the 2 dates
                if (keyA < keyB) return -1;
                if (keyA > keyB) return 1;
                return 0;
            });
            //console.log("========PLayer sorting========")
            ////console.log(this.players)
            let resp: any = {
                Type: null,
                Mode: null,
                playedBy: null,
                balanceRequired: 0,
                gameMode: this.gameMode,
                gameTurnRemaining: this.gameTurnRemaining,
                _id: this._id,
                roomId: this.roomId,
                players: this.players.map(p => p.playerInfo),
                remainingPlayers: null,
                gameTime: this.gameTime,
                timestamp: 0,
                gameTimeRemaining: 0,
                capacity: this.capacity,
                isFull: this.isFull,
                state: this.state,
                isRunning: this.isRunning(),
                turnIndex: 0,
                phase: 1,
                turnTime: TURN_TIME,
                rollTime: 0,
                moveTime: 0,
                changeTurn: false,
                rolledValues: null,
                skip: null,
                timeRemaining: -1,
                gameStartIn: DELAY_IN_GAME_START - DELAY_IN_PRE_GAME_START,
                syncAfter: 0,
                move: null,
                kill: null,
                gameStartTime: 1670492936649
            };
            const httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
            this.log(`Sending prestartgame event`, httpResp);
            //console.log(`Sending prestartgame event`, httpResp);
            setTimeout((httpResp) => {
                GameServer.Instance.socketServer.emitToSocketRoom(this.ID, 'preStartGame', httpResp);
            }, 1000, httpResp)
            // this.emit(httpResp, 'preStartGame')

            setTimeout(this.onGameStart.bind(this, contestData), DELAY_IN_GAME_START - DELAY_IN_PRE_GAME_START);
        } catch (err) {
            this.state = GameState.WAITING
            this.log(`Error while onGameStart and destroying game`, err)
            this.destroyRoom();
            throw err;
        }
    }

    private async onGameStart(contestData: ContestData) {
        try {
            
            let board = await Board.Instance.getBoardTableRedis(this.ID)
            //start build from here
            this.SnakeHead = Board.Instance.SnakeHead;
            this.SnakeTail = Board.Instance.SnakeTail;
            this.LadderHead = Board.Instance.LadderHead;
            this.LadderTail = Board.Instance.LadderTail;
            this.Snake1 = Board.Instance.Snake1;
            this.Snake2 = Board.Instance.Snake2;
            this.Snake3 = Board.Instance.Snake3;
            this.Snake4 = Board.Instance.Snake4;
            this.log("getting board address from redis")
            
            let getPowerFromRedis:any = await Board.Instance.getPowerCardFromRedis(this.ID)
            this.PowerCan = getPowerFromRedis.PowerCan;
            this.PowerCard = getPowerFromRedis.PowerCard;
            this.PowerCardPath = getPowerFromRedis.PowerCardPath;
            
            this.log("Random Varriable " + this.PowerCan + " path " + this.PowerCardPath+" power"+this.PowerCard)
            //console.log("Random Varriable " + this.PowerCan + " path " + this.PowerCardPath)
            this.state = GameState.RUNNING;
            this.gameStartTime = Date.now();
            GameServer.Instance.GameCount.inc();
            //this.startGameCountDown();
            this.startTurnPhaseTimer();
            let resp = {
                _id: this._id,
                players: this.players.map(p => p.playerInfo),
                capacity: this.capacity,
                isFull: this.isFull,
                state: this.state,
                isRunning: this.isRunning(),
                timeRemaining: -1,
                phase: GamePhase.ROLL_DICE,
                gameTime: this.gameTime,
                roomId: this.roomId,
                gameStartTime: this.gameStartTime,
                gameStartIn: DELAY_IN_GAME_START - DELAY_IN_PRE_GAME_START,
                gameTurnRemaining: this.gameTurnRemaining,
                turnTime: TURN_TIME,
                SnakeHead: this.SnakeHead,
                SnakeTail: this.SnakeTail,
                LadderHead: this.LadderHead,
                LadderTail: this.LadderTail,
                PowerCan: this.PowerCan,
                PowerCard: this.PowerCard,
                previousRollDice: this.previousRollDice,
                PowerCardPath: this.PowerCardPath,
                movePath: ["01"]
            };
            this.sendLogInMongo('startGame');
            const httpResp = new BaseHttpResponse(resp, null, 200, this.ID);
            this.log('Sending startGame event ', httpResp);
            //console.log("=======startGame Event========")
            //console.log(resp)
            this.emit(httpResp, 'startGame')
            // this.players.forEach(player => {
            //     if (player.isXFac) {
            //         player.startGame();
            //     }
            // })

        } catch (err) {
            this.state = GameState.WAITING
            //console.log(err)
            this.log(`Error while onGameStart and destroying game`, err)
            this.destroyRoom();
            throw err;
        }
    }

    private printPlayerArr() {
        //console.log("players info");
        this.players.forEach(player => {
            //console.log("\n ", player.playerInfo);
        })
    }

    private getTransactionData() {
        var data: TransactionTokenRequest = {
            cid: Number(this.CONTEST_ID),
            userList: [],
            gameserverid: this.ID,
            gameId: this.gameId
        }
        for (let i = 0; i < this.players.length; i++) {
            let player = this.players[i]
            data.userList.push({
                UserId: player.DID,
                UserLoginId: player.MID,
                ReferCode: player.REFER_CODE
            })
        }
        return data
    }

    public canJoin(userId: string): boolean {
        //console.log(this.ID, this.players, userId)
        if (this.isFull) return false;
        for (let index = 0; index < this.players.length; index++) {
            //console.log("playerID userID", this.players[index].ID, userId);
            if (this.players[index].ID.toString() == userId.toString()) {
                //console.log("Return False ");
                return false;
            }
        }
        return true;
    }

    private mongoStartGameData(): any {
        return {
            _id: this._id,
            state: this.state,
            startedAt: Date.now(),
            players: this.players.map(p => p.playerInfo),
            gameId: this.gameId
        }
    }

    private redisStartGameData(): any {
        const resp = {
            _id: this._id,
            capacity: this.capacity,
            isFull: this.isFull,
            state: this.state,
            startedAt: Date.now(),
            gameStartTime: this.gameStartTime,
            gameTime: this.gameTime,
            isGameTimeOver: this.isGameTimeOver,
            roomId: this.roomId,
            contestId: this.CONTEST_ID,
            isOnGameEndCallbackCalled: this.isOnGameEndCallbackCalled,
            players: JSON.stringify(this.players.map(p => p.playerProperties())),
            gameConfig: this.gameConfig,
            gameLevel: this.gameLevel,
            xFacLogId: this.xFacLogId,
            xFacId: this.xFacId,
            gameId: this.gameId
        }
        // return JSON.stringify(resp);
        return resp;
    }

    private mongoLogGameData(playedBy: string): any {
        const resp: any = {
            _id: this._id,
            state: this.state,
            startedAt: Date.now(),
            gameStartTime: this.gameStartTime,
            contestId: this.CONTEST_ID,
            players: this.players.map(p => p.playerLogProperties()),
            gameLevel: this.gameLevel,
            playedBy: playedBy
        }
        return resp;
    }

    private redisSyncGameData(): any {
        const resp = {
            state: this.state,
            gameTime: this.gameTime,
            isGameTimeOver: this.isGameTimeOver,
            isOnGameEndCallbackCalled: this.isOnGameEndCallbackCalled,
            players: JSON.stringify(this.players.map(p => p.playerProperties())),
        }
        gameLog('common', 'Game sync redis=>', resp)
        return resp;
    }

    private async sendLogInMongo(evName: string, playedBy: string = null) {
        let ack = await GameServer.Instance.RabbitMQ.pushToLogQueue({
            evName: evName,
            GameId: this.gameId,
            roomId: this.roomId,
            evTimestamp: Date.now(),
            data: this.mongoLogGameData(playedBy)
        })
        this.log('Rabbit log ack', evName, ack);
    }

    private startGameCountDown() {
        this.gameTimer = setTimeout(this.onGameCountDownCallback.bind(this), this.gameTime);

    }

    private reStartGameCountDown() {
        const timeRemaining = this.gameTime - (Date.now() - this.gameStartTime);
        this.gameTimer = setTimeout(this.onGameCountDownCallback.bind(this), timeRemaining);

    }

    private async onGameCountDownCallback() {
        this.log("\n \n \n Game time is over set isGameTimeOver=true\n \n \n ");
        //console.log("\n \n \n GAME IS OVER \n \n \n ");
        this.isGameTimeOver = true;
        this.gameEnd();
    }

    private async gameEnd() {
        const userPrizes = await this.getContestPrize();
        this.log(`User prizes are(onTimeout) - `, userPrizes)
        const players = this.players.map(p => p.playerInfo).sort((a, b) => b.score - a.score);
        players.forEach(player => {
            //console.log('Player data', player);
            let isExitPlayer = player.isExitPlayer
            const rank = this.assignRank(player.userId, isExitPlayer);
            const getPlayer = this.getPlayerById(player.userId);
            let state = isExitPlayer ? player.state : PlayerState.WON
            this.log(`Updateing player state on gametimeout -`, getPlayer.ID, state, rank, userPrizes[getPlayer.MID])
            getPlayer.updatePlayerState(state, rank, userPrizes[getPlayer.MID]);
        });
        //console.log("players ", players);
        //console.log("OnGame Time over ...");
        clearTimeout(this.gameTimer);
        // this.clearAllTimeouts();
        this.state = GameState.FINISHED;
        this.onGameEnd();
    }

    private async onGameEnd() {
        const redisData: any = this.redisStartGameData();
        this.sendLogInMongo('endGame');
        const resp = await GameServer.Instance.GameServices.createGameEntryOnEnd(redisData);
        //console.log("resp after updating....", resp);


        if (!this.isOnGameEndCallbackCalled) {
            this.isOnGameEndCallbackCalled = true
            GameServer.Instance.GameCount.dec();
        }
        // this.log(`Decrease counter for contest - ${this.CONTEST_ID} at - ${-(this.Capacity)}`)
        // await GameServer.Instance.ContestMethods.incContestCounter(this.CONTEST_ID, -(this.Capacity));
        

        let winningData = this.getWinningUserData()
        let currentPlayer = this.getCurrentPlayer();
        if (currentPlayer.isXFac) {
            this.log('Currenplayer is xfac in change turn', currentPlayer)
            currentPlayer.xfac.destroyOnEnd(currentPlayer.MID);
        }
        let ack = await GameServer.Instance.RabbitMQ.pushToWinningQueue(winningData)
        this.log('Winning data ack of rabit mq', ack, winningData)
        this.sendGameEndResp();


    }

    private sendGameEndResp() {
        const gameEndResp = {
            players: this.players.map(p => {
                const resp = p.playerInfo;
                //console.log("player , ", resp);
                return resp;
            }),
            state: this.state,
            roomId: this.roomId,
        }
        const httpResp = new BaseHttpResponse(gameEndResp, null, 200, this.ID, true)
        this.log('Set timout for gameEnd resp and destroy room');
        setTimeout(()=>{this.sendGameEndEvent(httpResp,this.ID)}, DELAY_IN_GAME_END);
        // sendGameEndEvent(httpResp, this.ID)

        this.destroyRoom();

    }

    private getWinningUserData() {
        var data: GameWinningData = {
            RoomId: this.roomId.toString(),
            ContestId: this.CONTEST_ID,
            participantScores: [],
            ExitCount: 0,
            AutoExitCount: 0,
            NormalCount: 0,
            //GameId: this.gameId,
            IsPrivate:false,
            IsOffline:false
        };
        let exitCount = 0;
        let autoExitCount = 0;
        let normalCount = 0;
        for (let i = 0; i < this.players.length; i++) {
            let player = this.players[i]
            let score = player.SCORE
            if (player.isExitPlayer) {
                if (player.State == PlayerState.EXIT) {
                    score = -1
                    exitCount++;
                } else {
                    score = -2
                    autoExitCount++;
                }

            } else {
                normalCount++
            }
            data.participantScores.push({
                UserId: player.MID,
                Score: score
            })
        }
        data.ExitCount = exitCount;
        data.NormalCount = normalCount;
        data.AutoExitCount = autoExitCount;
        return data
    }

    public async getContestPrize() {
        try {
            let userPrizes: any = {}
            const prizeReq: ContestWinnerRequest = {
                ContestId: Number(this.CONTEST_ID),
                RoomId: Number(this.roomId),
                ludoParticipantScore: []
            };
            for (let i = 0; i < this.players.length; i++) {
                let currentPlayer = this.players[i];
                // If player exit from game the send score -1 
                prizeReq.ludoParticipantScore.push({
                    UserId: Number(currentPlayer.MID),
                    Score: currentPlayer.isExitPlayer ? -1 : currentPlayer.SCORE
                })
                userPrizes[currentPlayer.MID] = 0;
            }
            let prizeResp;

            prizeResp = await GameServer.Instance.TransactionMethods.getContestWinners(prizeReq, this.ID);
            for (let i = 0; i < prizeResp.length; i++) {
                userPrizes[prizeResp[i] ?.UserId] = prizeResp[i] ?.Amount
            }
            this.log('User prize data=>', prizeReq, prizeResp, userPrizes);
            return userPrizes

        } catch (err) {
            this.log('Error while getting user prize', err);
            throw err;
        }

    }

    private assignRank(playerId: string, isExit: boolean): number {
        //console.log("assignRank , playerid ", playerId);
        const data = this.players.filter(p => {
            //console.log("p id player id ", p.ID, " - ", playerId);
            if (p.ID == playerId) {
                return p;
            }
        });
        //console.log("data  ", data);
        if (data && data.length == 0) {
            const err = new Error();
            err.name = "1";
            err.message = "Invalid user found";
            throw err;
        }
        const player = data[0];
        if (player.RANK >= 0) {
            return player.RANK;
        }
        const ranks = this.players.map(p => p.RANK);
        //console.log("ranks ", ranks);
        //console.log("capcity ", this.capacity);
        if (isExit) {
            for (let i = this.capacity - 1; i >= 0; i--) {
                //console.log("i ", i);
                const exist = ranks.includes(i);
                //console.log("exist ", exist);
                if (exist == false) {
                    return i;
                }
                continue;
            }
        } else {
            for (let i = 0; i < this.capacity; i++) {
                //console.log("i ", i);
                const exist = ranks.includes(i);
                //console.log("exist ", exist);
                if (exist == false) {
                    return i;
                }
                continue;
            }
        }
    }

    public getPlayerById(playerId: string) {
        for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].ID == playerId) {
                return this.players[i];
            }
        }
    }

    private async gameSyncInRedis() {
        const resp = await GameServer.Instance.GameServices.syncGameState(this._id, this.redisSyncGameData())
    }

    public destroyRoom() {
        this.log(`Destroy game`, this.gameLevel)
        if (this.gameLevel != GameLevel.NORMAL) {
            this.players.forEach((player) => {
                if (player.isXFac) {
                    player.xfac.destroyOnEnd(this.xFacLogId)
                }
            })
        }
        TableManager.deleteTableFromMap(this.ID);
        TableManager.removeTableFromRunningGroup(this.ID);
    }

    public isExpired() {
        return ((Date.now() - this.gameStartTime) > 60000) && this.isWaiting()
    }

    public getWinnerId(): number {
        this.log('Player at winnerId', this.players);
        let winnerId: number = null;
        this.players.forEach((player) => {
            if (player.State == PlayerState.WON) {
                winnerId = player.MID
            }
        })
        return winnerId
    }

    public set GAME_CONFIG(val: GameConfig) {
        this.gameConfig = val
    }

    private emit(data: any, event: string) {
        GameServer.Instance.socketServer.emitToSocketRoom(this.ID, event, data);
        return true;
    }

    private joinRoom(data: any) {
        GameServer.Instance.socketServer.joinInSocketRoom(this.ID);
        return "Joined Now";
    }

    private getPlayer(playerId: string) {
        return this.players.find((p) => p.ID == playerId)
    }


    public log(...args: any) {
        gameLog(this.ID, args);
        return
    }

    public getOpponentScore(playerId: string): number {
        return this.players.find((p) => p.ID != playerId) ?.SCORE
    }
    public getOpponentPlayer(playerId: string): Player {
        for (let index = 0; index < this.players.length; index++) {
            if(this.players[index].ID != playerId){
                return this.players[index];
            }
        }
    }

    public getOpponentMid(playerId: string): number {
        return this.players.find((p) => p.ID != playerId) ?.MID
    }

    public getPlayerScore(playerId: string): number {
        return this.players.find((p) => p.ID == playerId) ?.SCORE
    }

    public isPlayerExist(playerId: string) {
        let isExist = false;
        this.players.forEach((player) => {
            if (player.ID.toString().toLowerCase() == playerId.toString().toLowerCase()) {
                isExist = true
            }
        })
        return isExist
    }

    public pathMaker(path: Array < number > ) {
        console.log("Path created on "+path)
        this.log("Path created on "+path)
        let pathMake: Array < string >= [];
        path.forEach((pos) => {
            if (pos.toString().length == 1) {
                pathMake.push("0" + pos.toString());
            } else {
                pathMake.push(pos.toString());
            }

        })
        return pathMake
    }
    public sendGameEndEvent(resp:any,_id:string){
        this.log(_id, 'Sending game End event', resp);
        GameServer.Instance.socketServer.emitToSocketRoom(_id, "gameEnd", resp);
    }
    public async getCurrentTurnIndex(turnIndex:number):Promise<any>{
        //get current turn index
        let player = this.getCurrentPlayer();
        if(this.turnIndex != turnIndex){
            this.turnIndex = (this.turnIndex + 1) % (this.players.length);
        }
        return this.turnIndex
    }
    public get PLAYERS() {
        return this.players
    }
    public isTimePassed(percent: number = 100) {
        let resp = false;
        this.log('Time passed function called', this.gameMode)
        // if (this.gameMode == GameMode.TIME_BASED) {
            let timePassed = Date.now() - this.gameStartTime
            let timePassedPercent = Math.floor(timePassed / this.gameTime * 100)
            resp = timePassedPercent > percent
        // } else if (this.gameMode == GameMode.TURN_BASED) {
        //     let turnPassed = this.totalTurn - this.gameTurnRemaining;
        //     let turnPassedPercent = Math.floor(turnPassed / this.totalTurn * 100)
        //     resp = turnPassedPercent > percent
        // }
        this.log('Time passed result', resp);
        return resp;

    }
    
}