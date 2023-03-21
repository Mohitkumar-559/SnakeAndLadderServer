import { ContestData, MoveTypePower, MoveTypePowerOwn, XFacPower } from "../../entities/game/game.model";
import { Game } from "../game/game";
import { User } from "../user/user"
import { IUser } from "../../../domain/entities/user/user.model";
import { AuthenticationService } from "middleware/auth";
import { GameServer } from "application";
import { Player } from "../player/player";
import { XFacMove, GameType, MoveType,PowerCard,HomePosition } from "../../entities/game/game.model";
import { getPawnDistanceFromHome, HOME, isNearHome, isSafePosition, isValidPawnPosition } from "../../../domain/operations/game/path";
import { XFacService } from "./xfac.service";
import { EmojiReply, XFacGameLog } from "./xfac.dto";

export class XFac {
    private user: User
    private ludo: Game
    private performOptimalMove: boolean = false;
    private opponentId: number;
    private token: string;
    private level: number;
    private isResultLogged: false;
    private xFacLogId: number;
    private xfacState = {
        BIG_WINNING: 3,
        CLOSE_WINNING: 2,
        EQUAL: 1,
        NO_STATE: 0,
        CLOSE_LOSSING: -1,
        BIG_LOSSING: -2,
        NEUTRAL: 4
    }
    constructor(ludo: Game) {
        this.ludo = ludo;
        this.ludo.log('Xfac created', this.user)
    }

    public async initOnRestart() {
        if(!this.ludo?.getXFacData().xFacId){
            this.ludo?.log('Invalid xfac to data to restart check redis data');
            return
        }
        let userData = await this.getUserDataFromId(this.ludo.getXFacData().xFacId);
        this.user = new User(null, userData, this)
        this.user.game = this.ludo
        this.opponentId = this.getOpponentId(userData._id)
        this.level = this.ludo?.getXFacData().xFacLevel
    }
    private getOpponentId(selfId: string){
        let opponentId;
        this.ludo.PLAYERS.forEach((p)=>{
            if(p.DID.toLocaleLowerCase()!=selfId.toLocaleLowerCase()){
                opponentId = p.MID
            }
        })
        return opponentId
    }

    private canPerformOptimalMove() {
        let xfacState = this.getState();
        this.ludo?.log('get state in optimal move', xfacState);
        if (!this.performOptimalMove) {
            if (xfacState == this.xfacState.NO_STATE) {
                let randomNo = Math.floor(Math.random() * 2)
                this.performOptimalMove = randomNo == 1;
            } else if (xfacState > this.xfacState.EQUAL) {
                this.performOptimalMove = false
            } else {
                this.performOptimalMove = true
            }
            this.ludo.log('XFac check kill: ', this.performOptimalMove, xfacState)
        }
        this.ludo.log('XFac perform kill: ', this.performOptimalMove)
        return this.performOptimalMove;
    }

    public async makeMove() {
        try {
            if (!this.ludo.isRunning) {
                return false;
            }
            this.ludo?.log('Xfac roll dice timeout')
            await this.timeout();
            this.ludo.log('XFac turn come')

            //decide if power is present in the game
            let currentPLayer = this.ludo.getCurrentPlayer();
            if(currentPLayer.getPowerStack().length>0){
                //now decide the dv value

                let finalMove:any = await this.decidePowerMove()
                console.log("decision makeing for use power in xfac")
                console.log(finalMove)
                if(finalMove.length>0){

                    let PlayedOnPlayer = this.ludo.getPlayerById(finalMove[0].playerID)
                    if(finalMove[0].newPos == HOME && PlayedOnPlayer.Powerstack[finalMove[0].powerIndex]<=0){
                        //DO NOTHIGN
                    }
                    else{
                        let PowerMoveResponse: any = await this.ludo.onPowerCard(this.user.userId, finalMove[0].pawnIndex, finalMove[0].powerIndex,finalMove[0].playerID)
                    }
                    
                }


            }

            const rollDiceResp: any = await this.user.onRollDice({}, () => { })
            if(rollDiceResp.statusCode == 400){

                console.log('Roll dice resp', rollDiceResp);
            }
            const dv: number = rollDiceResp?.data?.rolledValues[0]

            
            let optimalMove: XFacMove = await this.decideMove(dv)
            console.log("===========normal move ==========")
            console.log(optimalMove)



            // let pawnToMove = pawnMoves.length > 0 ? pawnMoves[0].pawnIndex : 0;
            this.ludo?.log('Xfac move pawn timeout')
            await this.timeout();
            let moveResp = await this.user.onMovePawn({ pawnIndex: optimalMove?.pawnIndex || 0 }, () => { })
            if (this.ludo.getCurrentPlayer().ID == this.user.playerOpts._id) {
                this.ludo.log('XFac get next turn also')
                this.makeMove();
            }
            return
        } catch (err) {
            this.ludo?.log('Error in XFac makeMove', err);
        }
    }

    public async joinMatch(opponentId: number, xFacId: string = null, level: number = null) {
        try {
            let contestData: any;
            // if(this.ludo?.isMegaContest){
            //     contestData = await GameServer.Instance.ContestMethods.getMegaContestById(this.ludo.CONTEST_ID)
            // } else{
                contestData = await GameServer.Instance.ContestMethods.getContestById(this.ludo.CONTEST_ID,5);
            // }
            this.opponentId = opponentId;
            let userData: IUser;
            if (xFacId) {
                userData = await this.getUserDataFromId(xFacId);
                this.level = level
            } else {
                userData = await this.getUserDataForXFac(contestData)
            }
            // userData.name = 'x_'.repeat(this.level) + userData.name
            
            console.log('User data', userData)
            this.user = new User(null, userData, this)
            let joinResp = await this.ludo.join(this.user.playerOpts, contestData, this.level,xFacId);
            this.ludo.log('XFac success in join match', joinResp);
            this.user.game = this.ludo
        } catch (err) {
            this.ludo.log('Error in XFac joining=>', err);
            throw err
        }

    }

    private async getUserToken(contestData: ContestData) {
        // Call method to get user id
        // Call method to get user token
        try {
            let xFacUserData = await XFacService.Instance.getUserToken(contestData.ja, contestData.mba, this.ludo.ID, this.opponentId);
            this.level = xFacUserData.xFacLevel;
            this.xFacLogId = xFacUserData.xFacLogId;
            return xFacUserData.token
        } catch (err) {
            this.ludo.log('Error in getUserToken', err);
            return null
        }

    }

    private async getUserDataForXFac(contestData: ContestData) {
        let userToken = await this.getUserToken(contestData);
        if (!userToken) throw new Error('Unable to create token for xfac')
        let user: IUser = AuthenticationService.validateToken(userToken);
        if (!user) throw new Error('Unable to create user for xfac')
        return user;
    }

    private async getUserDataFromId(userId: string) {
        let userToken = await XFacService.Instance.getToken(userId);
        let user: IUser = AuthenticationService.validateToken(userToken);

        if (!user) throw new Error('Unable to create user for xfac')
        return user;
    }

    private timeout() {
        let MAX_TURN_TIME = 5;
        let MIN_TURN_TIME = 1;
        let xfacState = this.getState();
        this.ludo?.log('xfac state on timeout', xfacState);
        if (xfacState == this.xfacState.BIG_WINNING) {
            MAX_TURN_TIME = 6
            MIN_TURN_TIME = 3
        } else if (xfacState == this.xfacState.BIG_LOSSING) {
            MAX_TURN_TIME = 4
            MIN_TURN_TIME = 0
        }
        let waitTime = Math.ceil(Math.random() * (MAX_TURN_TIME - MIN_TURN_TIME) + MIN_TURN_TIME) * 1000;
        this.ludo?.log(`Max is ${MAX_TURN_TIME}, Min is ${MIN_TURN_TIME}, waitTime is ${waitTime}`)
        return new Promise(resolve => setTimeout(resolve, waitTime));
    }

    private waitFor(sec: number){
        return new Promise(resolve => setTimeout(resolve, sec*1000));
    }

    public async decideXfacMove(dv:number){
        let currentPlayer = this.ludo.getCurrentPlayer();
        let xfacMoves : Array<XFacMove> = []
        let xFacPawnStack = currentPlayer.getPawnStack();
        if (this.ludo.canMovePawn(currentPlayer.POS)) {
            xFacPawnStack.forEach(async (pawnPos, pawnIndex, pawnStack) => {

                if (isValidPawnPosition(currentPlayer.POS, dv, pawnPos, false)) {
                    //let newPawnPos = currentPlayer.calculateCoinPosition(pawnIndex, dv);
                    let newPos = await this.calculationPos(currentPlayer,pawnPos,dv)
                        let getSnake = this.ludo.SnakeHead.includes(newPos);
                        let getLadder = this.ludo.LadderTail.includes(newPos);
                        let getPower = this.ludo.PowerCard.includes(newPos);
                        let getHome = ((newPos == HomePosition.HOME) ? true : false)
                        let pawnIndex = currentPlayer.getPawnStack().indexOf(pawnPos)
                        if(getSnake){
                            xfacMoves.push({
                                pawnIndex: pawnIndex,
                                moveType: MoveTypePowerOwn.SNAKE,
                                newPos: newPos
                            });
                        }
                        else if(getLadder){
                            xfacMoves.push({
                                pawnIndex: pawnIndex,
                                moveType: MoveTypePowerOwn.LADDER,
                                newPos: newPos
                            });
                        }
                        else if(getPower){
                            xfacMoves.push({
                                pawnIndex: pawnIndex,
                                moveType: MoveTypePowerOwn.POWER,
                                newPos: newPos
                            });
                        }
                        else if(getHome){
                            xfacMoves.push({
                                pawnIndex: pawnIndex,
                                moveType: MoveTypePowerOwn.HOME,
                                newPos: newPos
                            });
                        }
                        else{
                            //nothing
                            xfacMoves.push({
                                pawnIndex: pawnIndex,
                                moveType: MoveTypePowerOwn.NOTHING,
                                newPos: newPos
                            });
                        } 
                    
                }
            })
        }
        
        return xfacMoves
    }

    public async decideXfacMovePower(){
        let currentPlayer = this.ludo.getCurrentPlayer();
        let xfacMoves : Array<XFacPower> = []
        let xFacPawnStack = currentPlayer.getPawnStack();
        for (let powerIndex = 0; powerIndex < currentPlayer.Powerstack.length; powerIndex++) {
            for (let playerIndex = 0; playerIndex < this.ludo.PLAYERS.length; playerIndex++) {
                for (let pawnIndex = 0; pawnIndex < this.ludo.PLAYERS[playerIndex].getPawnStack().length; pawnIndex++) {
                    let newPos = await this.calculationPos(this.ludo.PLAYERS[playerIndex],this.ludo.PLAYERS[playerIndex].getPawnStack()[pawnIndex],currentPlayer.Powerstack[powerIndex])
                    let getSnake = this.ludo.SnakeHead.includes(newPos);
                    let getLadder = this.ludo.LadderTail.includes(newPos);
                    let getPower = this.ludo.PowerCard.includes(newPos);
                    let getHome = ((newPos == HomePosition.HOME) ? true : false)
                    // let pawnIndex:number = currentPlayer.getPawnStack().indexOf(pawn)
                    // let powerIndex:number = currentPlayer.Powerstack.indexOf(powerUsed)
                    let newPawnPos:number = newPos
                    if(getSnake){
                        xfacMoves.push({
                            playerID:this.ludo.PLAYERS[playerIndex].ID,
                            pawnIndex: pawnIndex,
                            powerIndex:powerIndex,
                            moveType: MoveTypePower.SNAKE,
                            newPos: newPawnPos
                        });
                    }
                    else if(getLadder){
                        xfacMoves.push({
                            playerID:this.ludo.PLAYERS[playerIndex].ID,
                            pawnIndex: pawnIndex,
                            powerIndex:powerIndex,
                            moveType: MoveTypePower.LADDER,
                            newPos: newPawnPos
                        });
                    }
                    else if(getPower){
                        xfacMoves.push({
                            playerID:this.ludo.PLAYERS[playerIndex].ID,
                            pawnIndex: pawnIndex,
                            powerIndex:powerIndex,
                            moveType: MoveTypePower.POWER,
                            newPos: newPawnPos
                        });
                    }
                    else if(getHome){
                        xfacMoves.push({
                            playerID:this.ludo.PLAYERS[playerIndex].ID,
                            pawnIndex: pawnIndex,
                            powerIndex:powerIndex,
                            moveType: MoveTypePower.HOME,
                            newPos: newPawnPos
                        });
                    }
                    else{
                        //nothing
                        xfacMoves.push({
                            playerID:this.ludo.PLAYERS[playerIndex].ID,
                            pawnIndex: pawnIndex,
                            powerIndex:powerIndex,
                            moveType: MoveTypePower.NOTHING,
                            newPos: newPawnPos
                        });
                    }
                }
            }
        }
        // currentPlayer.Powerstack.forEach((powerUsed)=>{
        //     this.ludo.PLAYERS.forEach((player)=>{
        //         player.getPawnStack().forEach(async (pawn)=>{
        //             let newPos = await this.calculationPos(player,pawn,powerUsed)
        //             let getSnake = this.ludo.SnakeHead.includes(newPos);
        //             let getLadder = this.ludo.LadderTail.includes(newPos);
        //             let getPower = this.ludo.PowerCard.includes(newPos);
        //             let getHome = ((newPos == HomePosition.HOME) ? true : false)
        //             let pawnIndex:number = currentPlayer.getPawnStack().indexOf(pawn)
        //             let powerIndex:number = currentPlayer.Powerstack.indexOf(powerUsed)
        //             let newPawnPos:number = newPos
        //             if(getSnake){
        //                 xfacMoves.push({
        //                     playerID:player.ID,
        //                     pawnIndex: pawnIndex,
        //                     powerIndex:powerIndex,
        //                     moveType: MoveTypePower.SNAKE,
        //                     newPos: newPawnPos
        //                 });
        //             }
        //             else if(getLadder){
        //                 xfacMoves.push({
        //                     playerID:player.ID,
        //                     pawnIndex: pawnIndex,
        //                     powerIndex:powerIndex,
        //                     moveType: MoveTypePower.LADDER,
        //                     newPos: newPawnPos
        //                 });
        //             }
        //             else if(getPower){
        //                 xfacMoves.push({
        //                     playerID:player.ID,
        //                     pawnIndex: pawnIndex,
        //                     powerIndex:powerIndex,
        //                     moveType: MoveTypePower.POWER,
        //                     newPos: newPawnPos
        //                 });
        //             }
        //             else if(getHome){
        //                 xfacMoves.push({
        //                     playerID:player.ID,
        //                     pawnIndex: pawnIndex,
        //                     powerIndex:powerIndex,
        //                     moveType: MoveTypePower.HOME,
        //                     newPos: newPawnPos
        //                 });
        //             }
        //             else{
        //                 //nothing
        //                 xfacMoves.push({
        //                     playerID:player.ID,
        //                     pawnIndex: pawnIndex,
        //                     powerIndex:powerIndex,
        //                     moveType: MoveTypePower.NOTHING,
        //                     newPos: newPawnPos
        //                 });
        //             }
        //         })
        //     })
        //     console.log("Power can used by xfac")
        //     console.log(xfacMoves)
        // })
        
        return xfacMoves
    }

    private async decideMove(dv: number) {
        try {
            let currentPlayer = this.ludo.getCurrentPlayer();
            let xFacPawnStack = currentPlayer.getPawnStack();
            //let xFacPowerStack = currentPlayer.getPowerStack();
            //decide which power is too be use
            // if(xFacPowerStack.length>0){
                //tigger power check that power can be used of not
                
            // }
            
            let xfacMoves: Array<XFacMove> = await this.decideXfacMove(dv);
            //let similarMoves: Array<XFacMove> = [];
            
            // Sort moves according to weightage
            //xfacMoves.sort((a, b) => b.moveType - a.moveType);
            this.ludo?.log('Possible moves are =>', xfacMoves)
            let sorted_result:any = xfacMoves.sort((a, b) => {
                return a.moveType-b.moveType;
            }
           )
           let moveToExecute:any = sorted_result[0]
            this.ludo.log('XFac posible moves', sorted_result, moveToExecute);
            console.log('XFac posible moves', sorted_result,  moveToExecute);

            return moveToExecute
        } catch (err) {
            this.ludo.log('Error in XFac decideMove', err);
        }

    }

    public static isSafeMove(ludo: Game, newPos: number) {
        //console.log('check safe move call', newPos)
        for (let i = 1; i <= 5; i++) {
            let backPos = newPos - i;
            let resp = ludo.getAllCoinsAtPosition(backPos, false);
            //console.log(newPos, i, backPos, resp)
            if (resp.length >= 1) {
                return false
            }
        }
        return true
    }

    public static getNonKillValue(opponent: Player, ludo: Game) {
        try {
            let dv: number;
            let isKill = false;
            let randomNo = Math.floor(Math.random() * 3)
            // Only 33% chance to allow player to kill pawn 
            let allowToKill = randomNo == 0 ? true : false

            // If dice stack is emply first fill it;
            if (opponent.DiceValueStack.length == 0) {
                ludo.generateDiceValue();
            }

            // Only get non kill value when allowToKill = false
            if (!allowToKill) {
                let i = 0;
                let currentPlayer = ludo.getCurrentPlayer();
                ludo.log('Opponent stack', opponent.DiceValueStack)
                for (; i < opponent.DiceValueStack.length; i++) {
                    dv = opponent.DiceValueStack[i]
                    isKill = false;
                    opponent.getPawnStack().forEach((pawnPos, pawnIndex, stack) => {
                        if (isValidPawnPosition(opponent.POS, dv, pawnPos, false)) {
                            let newPawnPos = opponent.calculateCoinPosition(pawnIndex, dv);
                            if (ludo.eliminateCoin(newPawnPos, true,dv,pawnIndex,false,currentPlayer,4)) {
                                ludo.log('Found value that kill XFac', dv, newPawnPos, pawnIndex, opponent.DiceValueStack)
                                isKill = true

                            }
                        }
                    });
                    if (!isKill) {
                        break
                    }
                }
                opponent.DiceValueStack.splice(i, 1);
                ludo.log('Opponent dv is', dv);
            }

            return dv
        } catch (err) {
            ludo.log('Error in opponentMove', err);
        }

    }

    public static getOptimalValue(player: Player, ludo: Game, moveType: MoveType = MoveType.KILL): number {
        let dv: number;
        for (let pawnIndex = 0; pawnIndex < player.getPawnStack().length; pawnIndex++) {
            for (let i = 1; i <= 6; i++) {
                let newPawnPos = player.calculateCoinPosition(pawnIndex, i);
                // ludo.log('Postin=>', i, pawnIndex, newPawnPos)
                let currentPlayer = ludo.getCurrentPlayer();
                if (moveType == MoveType.KILL) {
                    if (ludo.eliminateCoin(newPawnPos, true,dv,pawnIndex,false,currentPlayer,4)) {
                        // if (i > 6 && i < 13) {
                        //     player.DiceValueStack.unshift(i - 6)
                        //     return 6;
                        // } else if (i > 12 && i <= 17){
                        //     player.DiceValueStack.unshift(6, i-12)
                        //     return 6
                        // }
                        ludo.log('Kill value=====>', i);
                        return i;
                    }
                } else if (moveType == MoveType.HOME && newPawnPos == 100) {
                    ludo.log('home value=====>', i);
                    return i;
                } else if (moveType == MoveType.SAFE_POSITION && isSafePosition(newPawnPos)) {
                    ludo.log('safe value=====>', i, newPawnPos);
                    return i;
                }
            }

        };
        return null
    }

    public getDv(player: Player): number {
        this.ludo?.log('OPTIMAL MOVE CALL');
        if (this.canPerformOptimalMove()) {
            let killDiceValue = XFac.getOptimalValue(player, this.ludo, MoveType.KILL);
            if (!killDiceValue) {
                killDiceValue = XFac.getOptimalValue(player, this.ludo, MoveType.HOME);
                if (!killDiceValue) {
                    killDiceValue = XFac.getOptimalValue(player, this.ludo, MoveType.SAFE_POSITION);
                }
            }
            this.ludo.log('Xfac kill value: ', killDiceValue);
            if (killDiceValue) this.performOptimalMove = false;
            return killDiceValue;
        }
        return null
    }

    // Method to check if xfac is losing or winning or normal.
    public getState() {
        let self: Player, opponent: Player;
        let SAFE_SCORE_DIFF = 20;

        this.ludo.log('game time on getState', this.ludo.isTimePassed(50))
        if (this.level == GameType.XFAC_HARD && !this.ludo.isTimePassed(50)) {
            return this.xfacState.NO_STATE
        } else if (this.level == GameType.XFAC_EASY && !this.ludo.isTimePassed(70)) {
            return this.xfacState.NEUTRAL;
        }


        for (let i = 0; i < this.ludo.PLAYERS.length; i++) {
            if (this.ludo.PLAYERS[i].ID == this.user.playerOpts._id) {
                self = this.ludo.PLAYERS[i]
            } else {
                opponent = this.ludo.PLAYERS[i]
            }
        }
        let scoreDiff = self.SCORE - opponent.SCORE
        if (scoreDiff > SAFE_SCORE_DIFF) {
            return this.xfacState.BIG_WINNING;
        } else if (scoreDiff > 0 && scoreDiff <= 20) {
            return this.xfacState.CLOSE_WINNING;
        } else if (scoreDiff == 0) {
            return this.xfacState.EQUAL
        } else if (scoreDiff > -SAFE_SCORE_DIFF) {
            return this.xfacState.CLOSE_LOSSING
        } else {
            return this.xfacState.BIG_LOSSING
        }
    }

    public async destroyOnEnd(xFacLogId: number) {
        if (!this.isResultLogged) {
            let winnerId = this.ludo.getWinnerId();
            let result = winnerId == this.user.playerOpts.mid ? false : true
            let logData: XFacGameLog = {
                UserId: this.opponentId,
                XFacId: this.user.playerOpts.mid,
                XFacLevel: this.level,
                RoomId: this.ludo.roomId,
                Result: result,
                ContestId: this.ludo?.CONTEST_ID ? parseInt(this.ludo.CONTEST_ID) : null,
                xFacLogId: xFacLogId || this.xFacLogId
            }
            this.ludo.log('Send xfac logs', logData, winnerId, this.user.playerOpts.mid)
            await XFacService.Instance.saveXFacGameLog(logData)
        }
        this.user.game = null;
        this.ludo = null;
        this.user = null;
        return;
    }

    // public async sendEmoji(emoji: number) {
    //     let randomNo = Math.floor(Math.random() * 2)
    //     let sendEmoji = randomNo == 0;
    //     let emojiReplys = EmojiReply[emoji as keyof typeof EmojiReply]
    //     this.ludo.log('xfac tries to send emoji', sendEmoji, emojiReplys);
    //     if(sendEmoji && emojiReplys){
    //         let randomReplyIndex = Math.floor(Math.random() * emojiReplys.length)
    //         let resp = {
    //             messageId: emojiReplys[randomReplyIndex],
    //             userId: this.user.playerOpts.did
    //         }
    //         let randomTime = Math.ceil(Math.random() * (4 - 1) + 1);
    //         await this.waitFor(randomTime)
    //         this.user.onSendEmoji(resp, () => { })
    //     }
    // }

    
    async calculationPosPower(player:Player,pawn:number,power:number){
        let indexPawn:number = player.getPawnStack().indexOf(pawn)
        if(power == 0){
            return player.previouspawnStack[indexPawn]
        }
        if(power == -1){
            return player.getPawnStack()[indexPawn]-1
        }
        if(power == -2){
            return player.getPawnStack()[indexPawn]-2
        }
        if(power == 1){
            return player.getPawnStack()[indexPawn]+1
        }
        if(power == 2){
            return player.getPawnStack()[indexPawn]+2
        }
    }
    async  calculationPos(player:Player,pawn:number,power:number){
        let indexPawn:number = player.getPawnStack().indexOf(pawn)
        return player.getPawnStack()[indexPawn]+power 
    }
    filterByMoveType(item:XFacPower){
        let currentPLayer = this.ludo.getCurrentPlayer().ID
        if(item.playerID == currentPLayer ){
            if(item.moveType < 4)
                return item;
        }
        else{
            if(item.moveType == 4){
                return item
            }
        }
    }
    
    
    async decidePowerMove(){
        let currentPlayer = this.ludo.getCurrentPlayer();
        let xfacMoves:Array<XFacPower>=[];
        xfacMoves = await this.decideXfacMovePower()
        
        //sort the xfacmove
        let sorted_result:any = xfacMoves.sort((a, b) => {
            if(a.playerID == this.ludo.getCurrentPlayer().ID){
              return -1;
           }else if(a.playerID != this.ludo.getCurrentPlayer().ID){
              return 1;
           }else{
              return b.moveType-a.moveType;
           }
        }
       )
       console.log("before filter the move of power=========")
       console.log(xfacMoves)

       let sorted_result1:any = sorted_result.filter((a:XFacPower) => {
                let currentPLayer = this.ludo.getCurrentPlayer().ID
                if(a.playerID == currentPLayer ){
                    if(a.moveType < 4)
                        return a;
                }
                else{
                    if(a.moveType == 4){
                        return a
                    }
                }
            }
        )


       return sorted_result1;
    }
    

    

      
    
}