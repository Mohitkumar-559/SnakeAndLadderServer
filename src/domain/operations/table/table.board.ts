import { RedisStorage } from "database/redis/game.redis";
import { RedisKeys } from "database/redis/redis.keys";

export class Board {

    private static _instance: Board;
    public SnakeHead:Array<number>
    public SnakeTail:Array<number>
    public LadderHead:Array<number>
    public LadderTail:Array<number>
    public PowerCard:Array<number>
    public PowerCardPath:Array<string>
    public PowerCan:Array<number>
    private redis: RedisStorage;
    public DicardArray:Array<number>;
    public boardId:number;
    public Snake1:Array<string>
    public Snake2:Array<string>
    public Snake3:Array<string>
    public Snake4:Array<string>
    
    constructor(boardId:number){
        this.redis = RedisStorage.Instance;
        this.SnakeHead = [38,27,41,20]
        this.SnakeTail = [26,11,19,8]
        this.Snake1 = ["35","36","25"]
        this.Snake2 = ["22","23","14"]
        this.Snake3 = ["32","31","30"]
        this.Snake4 = ["17","18","07"]
        this.LadderHead = [16,39]
        this.LadderTail = [10,28]
        this.PowerCan = [2,1,0,-1,-2]
        this.PowerCard = [62,2,3]
        this.DicardArray=[1,64,57,6];
        this.boardId = boardId;
        this.PowerCardPath =["62","02","03"]

    }
    public static get Instance()
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this(1));
    }
    public async getBoardTableRedis(gameId:string) {
        try {
            const getBoardKey = RedisKeys.getGameBoard(this.boardId);
            var boards:any = await this.redis.get(getBoardKey);
            boards.forEach((board:any)=> {
                this.SnakeHead = board.snake.head;
                this.SnakeTail = board.snake.tail;
                this.Snake1 = board.snake.snake1;
                this.Snake2 = board.snake.snake2;
                this.Snake3 = board.snake.snake3;
                //this.Snake4 = board.snake.snake4;
                this.LadderHead = board.ladder.head;
                this.LadderTail = board.ladder.tail;
            });
            
            this.PowerCan = this.shuffle(this.PowerCan)

            let dicard = this.DicardArray.concat(this.LadderHead,this.LadderTail,this.SnakeHead,this.SnakeTail)
            for (let index = 0; index < this.PowerCard.length; index++) {
                if(index == 0){
                    dicard.push(0);
                }
                else{
                    dicard.push(this.PowerCard[index-1]);
                }
                this.PowerCard[index] = await this.getPowerCardPos(dicard);
                if(this.PowerCard[index].toString().length==1){
                    this.PowerCardPath[this.PowerCard.indexOf(this.PowerCard[index])] =  "0"+this.PowerCard[index].toString();
                }
                else{
                    this.PowerCardPath[this.PowerCard.indexOf(this.PowerCard[index])] = this.PowerCard[index].toString();
                }
                
            }

            //setting up the PowerCard in game redis
            const dataPowerCard = {
                PowerCard:this.PowerCard,
                PowerCardPath:this.PowerCardPath,
                PowerCan:this.PowerCan
            }
            const keyOfgameBoard = RedisKeys.getGamePowerCard(this.boardId,gameId)
            await this.redis.set(keyOfgameBoard,dataPowerCard,60)

            return true;
        } catch (err: any) {
            //console.log('Error while getting gameBoard', err);
            throw err
        }
    }
    public randomIntFromInterval(min:number, max:number,exclude:Array<number>=[0]):any { // min and max included 
        let rando = Math.floor(Math.random() * (max - min + 1) + min)
        if(exclude.includes(rando)){
            return this.randomIntFromInterval(min,max,exclude)
        }
        return rando;
    }
    public async getPowerCardPos(discardArr:Array<number>): Promise<any> { // discard some array for 
        let randompos =  Math.floor(Math.random() * (42 - 1 + 1) + 1)
        if(discardArr.includes(randompos)){
            return await this.getPowerCardPos(discardArr)
        }
        return randompos
    }
    public shuffle(array:Array<number>) {
        let currentIndex = array.length,  randomIndex;
      
        // While there remain elements to shuffle.
        while (currentIndex != 0) {
      
          // Pick a remaining element.
          randomIndex = Math.floor(Math.random() * currentIndex);
          currentIndex--;
      
          // And swap it with the current element.
          [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
        }
      
        return array;
      }

    public async getPowerCardFromRedis(gameId:string){
        const keyOfgameBoard = RedisKeys.getGamePowerCard(this.boardId,gameId)
            //getting data from redis in game
            const dataFromRedis:any = await this.redis.get(keyOfgameBoard)
            
        
        return dataFromRedis
    }
      
}