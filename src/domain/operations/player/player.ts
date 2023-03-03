import { PlayerOpts, PlayerState, PlayerType } from "domain/entities/player/player.model"
import { WINNING_POSITION } from '../../entities/game/game.model'
import { Game } from "../game/game"
import { gameLog } from 'utils/logger'
import { FruitCutXFac } from "../xfac/fruitcut.xfac"
import { XFacAbstract } from "../xfac/xfac.abstract"
import { XFacManager } from "../xfac/xfac.manager"
import { pathValue, getPawnIndex, PLAYER_PATH, SAFE_CELLS, validateNewPosition, getRouteFirstValue, totalDistance } from '../game/path'
export const EXIT_COIN_POSITION = 0
export class Player {
    public userId: string
    private name: string
    private color: number
    private pos: number
    private sixers: number
    private hasLadder:boolean
    private pawnStack: Array<number>
    private state: number
    private hasKilled: boolean
    private hasPower: boolean
    private score: number
    private rank: number
    private skip: number
    private initPosition: number
    private did: string
    private mid: number;
    private referCode: string;
    private prize: number;
    private totalGameWinner: number;
    private playerType: PlayerType;
    public xfac: XFacAbstract;
    private dvStack: Array<number>;
    public Powerstack: Array<number>;
    public CurrentPower:number;
    public previouspawnStack: Array<number>;
    public powerIndex:number
    constructor(opts: PlayerOpts) {
        //console.log("Player opts ", opts);
        this.userId = opts._id;
        this.mid = opts.mid
        this.did = opts.did
        this.name = opts.name;
        this.referCode = opts.referCode
        this.color = opts.pos != undefined ? (opts.pos + 1) : undefined;
        this.pos = opts.pos;
        this.initPosition = opts.pos != undefined ? PLAYER_PATH[opts.pos][0] : undefined;
        this.pawnStack = opts.pos != undefined ? [this.initPosition, this.initPosition] : [];
        this.previouspawnStack = opts.pos != undefined ? [this.initPosition, this.initPosition] : [];
        this.hasLadder=false;
        this.hasKilled=false;
        this.state = PlayerState.WAITING;
        this.score = 0;
        this.rank = -1;
        this.skip = 0;
        this.totalGameWinner = opts.totalGameWinners
        this.playerType = opts.playerType ? opts.playerType : PlayerType.HUMAN;
        this.xfac = opts.xfac;
        this.dvStack = [];
        this.Powerstack = []; 
        this.hasPower=false;
        this.CurrentPower=4;
        this.powerIndex=0;
        //console.log("Position ", this.pos);
        //console.log("Paws stack for pos ", this.pos);
        //console.log("Paws stack : ", this.pawnStack);
    }
    public initOnRestart(opts: any, game: Game) {
        this.userId = opts.userId;
        this.name = opts.name;
        this.color = (opts.pos + 1);
        this.pos = opts.pos;
        this.initPosition = opts.initPosition;
        this.pawnStack = opts.pawnStack;
        this.previouspawnStack = opts.previouspawnStack
        this.state = opts.state;
        this.hasKilled = opts.hasKilled;
        this.hasLadder = opts.hasLadder;
        this.score = opts.score;
        this.rank = opts.rank;
        this.skip = opts.skip;
        this.mid = opts.mid;
        this.did = opts.did;
        this.hasPower = opts.hasPower
        this.referCode = opts.referCode
        this.totalGameWinner = opts.totalGameWinner;
        this.playerType = opts.playerType || PlayerType.HUMAN,
        this.CurrentPower=4;
        if(this.playerType == PlayerType.XFAC){
            game.log('Creating xfac on playerInitOnRestart')
            this.xfac = XFacManager.getXFac(game);
            this.xfac.initOnRestart();
        }
        this.Powerstack = opts.Powerstack;
        this.powerIndex = opts.powerIndex
    }
    
    public playerProperties(): any {
        const resp = {
            userId: this.userId,
            name: this.clearString(this.name),
            color: this.color,
            pos: this.pos,
            pawnStack: this.pawnStack,
            previouspawnStack: this.previouspawnStack,
            state: this.state,
            hasKilled: this.hasKilled,
            hasLadder:this.hasLadder,
            skip: this.skip,
            score: this.SCORE,
            rank: this.rank,
            initPosition: this.initPosition,
            mid: this.mid,
            did: this.did,
            totalGameWinner: this.totalGameWinner,
            playerType: this.playerType,
            prize: this.prize,
            Powerstack:this.Powerstack,
            hasPower:this.hasPower,
            powerCard:this.CurrentPower,
            powerIndex:this.powerIndex
        }
        // return JSON.stringify(resp);
        return resp;
    }
    public skipped(yes: boolean): number {
        if (yes) {
            this.skip++;
        }
        else {
            // this.skip = 0;
        }
        return this.skip;
    }

    public playerLogProperties(): any {
        const resp = {
            userId: this.userId,
            name: this.clearString(this.name),
            state: this.state,
            score: this.score,
            rank: this.rank
        }
        // return JSON.stringify(resp);
        return resp;
    }
    public get playerInfo(): any {
        if (this.rank >= 0) {
            if (![PlayerState.EXIT, PlayerState.AUTOEXIT].includes(this.state)) {
                if (this.rank <= 0) {
                    this.state = PlayerState.WON;
                }
                // Only change state to lost if user did not exit or auto exit
                else {
                    this.state = PlayerState.LOST;
                }
            }
        }
        const resp = {
            userId: this.userId,
            name: this.clearString(this.name),
            color: this.color,
            pos: this.pos,
            pawnStack: this.pawnStack,
            previouspawnStack: this.previouspawnStack,
            state: this.state,
            hasKilled: this.hasKilled,
            hasLadder: this.hasLadder,
            skip: this.skip,
            score: this.SCORE,
            rank: this.rank,
            // mid: this.mid,
            did: this.did,
            referCode: this.referCode,
            prize: this.prize,
            isExitPlayer: this.isExitPlayer,
            Powerstack:this.Powerstack,
            hasPower:this.hasPower,
            powerCard:this.CurrentPower
        }
        return resp;
    }

    public get scoreInfo(){
        const resp = {
            userId: this.userId,
            score: this.score,   
        }
        return resp;
    }

    public get logInfo(){
        const resp = {
            userId: this.userId,
            name: this.clearString(this.name),
            state: this.state,
            score: this.score,
            rank: this.rank,
            mid: this.mid,
            did: this.did,
            prize: this.prize,
            Powerstack:this.Powerstack,
            hasPower:this.hasPower,
            powerCard:this.CurrentPower
        }
        return resp;
    }

    public get ID(): string {
        return this.userId;
    }

    public get DID(): string {
        return this.did;
    }

    public get MID(): number {
        return this.mid;
    }

    public get REFER_CODE(): string {
        return this.referCode;
    }

    public get RANK(): number {
        return this.rank;
    }

    public get State() {
        return this.state;
    }

    public get isExitPlayer() {
        return [PlayerState.EXIT, PlayerState.AUTOEXIT].includes(this.state);
    }

    public get SCORE(): number {
        return this.score;
    }
    public get isXFac() {
        return this.playerType == PlayerType.XFAC;
    }

    public set SCORE(val: number) {
        this.score += val;
        // Make sure score must not be negative
        if (this.score < 0) {
            this.score = 0
        }
    }

    public startGame(){
        this.xfac?.startGame();
    }

    public updatePlayerState(state: number, rank?: number, prize?: number): boolean {
        if (prize >= 0) {
            this.prize = prize;
        }
        if (this.rank === -1) {
            this.state = state;
            if (rank >= 0) {
                this.rank = rank;
                this.score = 1;
            }
            return true;
        }
        return false;
    }

    public updateOnGameStart(state: number): boolean {
        this.state = state;
        return true;
    }

    private clearString(str: string) {
        return str.replace(/\W/g, '');
    }

    public initPlayerPos(capacity: number, playerIndex: number): boolean {
        if (capacity == 2) {
            this.pos = playerIndex * 2;
        }
        else {
            this.pos = playerIndex
        }
        this.color = this.pos + 1
        this.initPosition = PLAYER_PATH[this.pos][0];
        this.pawnStack = [this.initPosition, this.initPosition];
        this.previouspawnStack = [this.initPosition, this.initPosition];
        this.Powerstack = []
        return true
    }
    public get POS(): number {
        return this.pos;
    }
    public get isPlaying(): boolean {
        return (this.state === PlayerState.PLAYING) ? true : false
    }
    public removePawnFromBoard() {
        this.pawnStack = [EXIT_COIN_POSITION, EXIT_COIN_POSITION]
    }
    public sixCounter(bool: boolean): number {
        if (bool) {
            this.sixers++;
            return this.sixers;
        }
        else {
            this.sixers = 0;
            return this.sixers;
        }
    }
    public get DiceValue() {
        return this.dvStack.pop()
    }
    public set DiceValueStack(values: Array<number>) {
        this.dvStack.push(...values);
    }
    public canMoveAnyPawn(diceValue: number) {
        const arr: any[] = this.pawnStack.map(pawnPos => {
            return validateNewPosition(this.pos, pawnPos, diceValue, this.hasKilled);
        })
        //console.log("can Move Arr ", arr);
        const some = arr.some(isTrue => isTrue);
        //console.log("some movable  ", some);
        return some;
    }

    public get DiceValueStack() {
        return this.dvStack;
    }
    public getPawnPosition(pawnIndex: number): number {
        return this.pawnStack[pawnIndex];
    }
    public getPawnIndex(pawnPos: number): number {
        return this.pawnStack.indexOf(pawnPos);
    }
    public updateHasKilled() {
        //console.log("\n \n Hash Killed oppnent .......", this.ID);
        this.hasKilled = true;
    }
    public get killedBefore(): boolean {
        return this.hasKilled;
    }
    private updatePos(index: number, pos: number, diceValue:number) {
        this.log("before updation previous pawn stack "+this.previouspawnStack+" dice value "+diceValue)
        //this.previouspawnStack = [...this.pawnStack];
        this.previouspawnStack[index] = this.pawnStack[index]
        this.log("after updation previous pawn stack "+this.previouspawnStack+" dice value "+diceValue)
        
        this.pawnStack[index] = pos;
    }
    private updateWinningStatus(): boolean {
        let homeTokens = 0;
        this.pawnStack.forEach(coin => {
            if (coin === WINNING_POSITION) {
                homeTokens++;
            }
        });
        //console.log("\n Home tokens ", homeTokens);
        // const won = this.pawnStack.every(
        //     (coin) => coin === WINNING_POSITION
        // );
        if (homeTokens >= 2) {
            this.state = PlayerState.WON;
            return true;
        }
        return false;
    }
    public setCoinPosition(pawnIndex: number, diceValue: number): boolean {
        const position = this.pawnStack[pawnIndex];
        if (position) {
            const positionIndex = getPawnIndex(this.pos, position, this.hasKilled);
            const newPositionIndex  = positionIndex + diceValue;
            const newPosition = pathValue(this.pos, newPositionIndex, this.hasKilled);
            this.updatePos(pawnIndex, newPosition,diceValue);
            return this.updateWinningStatus();
            // return true;
            // 
        }
        else if (diceValue === 6) {
            const startPos = getRouteFirstValue(this.pos);
            this.updatePos(pawnIndex, startPos,diceValue);
            return false;
        }
    }
    public get hasWon(): boolean {
        return (this.state === PlayerState.WON) ? true : false
    }
    public getPawnStack(): Array<any> {
        return this.pawnStack;
    }
    getHomeCoinsCount(): number {
        return this.pawnStack.filter((pos) => pos === 100).length;
    }
    public eliminateCoin(pawnPos: number): number {
        for (let i = 0; i < this.pawnStack.length; i++) {
            if (this.pawnStack[i] == pawnPos) {
                this.previouspawnStack[i]=this.pawnStack[i]
                this.pawnStack[i] = this.initPosition;
                return i;
            }
        }
    }
    public eliminateCoinBySnakeAndLadder(pawnPos: number,snakeTail:number,diceValue:number): number {
        for (let i = 0; i < this.pawnStack.length; i++) {
            if (this.pawnStack[i] == pawnPos) {
                this.log("before previous pawn stack in snake or ladder "+this.previouspawnStack +" dice value"+diceValue)
                if(diceValue>0){
                    this.previouspawnStack[i] = this.pawnStack[i]-diceValue
                }
                else{
                    this.previouspawnStack[i] = this.pawnStack[i]+diceValue
                }
                this.log("after previous pawn stack in snake or ladder "+this.previouspawnStack +" dice value"+diceValue)
                this.pawnStack[i] = snakeTail;

                return i;
            }
        }
    }
    public updateHasLadder() {
        //console.log("\n \n Hash ladder oppnent .......", this.ID);
        this.hasLadder = true;
    }
    public updatePowerCounter() {
        //console.log("\n \n Hash ladder oppnent .......", this.ID);
        this.hasPower = true;
    }
    public async removePowerCounter() {
        //console.log("\n \n Hash ladder oppnent .......", this.ID);
        this.hasPower = false;
        this.CurrentPower = 4;
    }

    public updatePowerStack(pawnPos: number,power:number){
        for (let i = 0; i < this.pawnStack.length; i++) {
            if (this.pawnStack[i] == pawnPos) {

                this.log("=======adding power stack=========");
                //this.Powerstack.push(power)
                if(this.Powerstack.length<3){
                    this.log("Power add to powerstack"+power)
                    this.Powerstack.push(power)
                    this.hasPower = true;
                }
                else{
                    this.log("Not able to Power add to powerstack"+power, this.Powerstack)
                    this.hasPower = false;
                }
                this.powerIndex++;
                return i;
            }
        }
        
    }

    public removePowerStack(index:number){
        //console.log("=======remove power stack=========")
        this.Powerstack.splice(index,1)
    }

    public getPowerStack(){
        return this.Powerstack;
    }
    public getPowerStackByIndex(index:number){
        return this.Powerstack[index];
    }
    public log(...args: any) {
        gameLog(this.ID, args);
        return
    }
    public resetSnakeAndLadder(){
        this.hasKilled=false;
        this.hasKilled=false;
    }
    

    
    
}