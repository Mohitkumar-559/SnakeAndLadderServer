import { GameServer } from "../../../application";
import Redis from "ioredis";
import UnitOfWork from "../../../database/sql";
import needle from 'needle';
import { gameLog } from "../../../utils/logger";
import { XFacGameLog } from "./xfac.dto";


export class XFacService {
    _redisClient: Redis;
    uow: UnitOfWork;
    private static _instance: XFacService;
    constructor() {
        this._redisClient = GameServer.Instance.REDIS.REDIS_CLIENT
        this.uow = GameServer.Instance.TransactionMethods.SQL_Instance
    }
    static get Instance() {
        if (!this._instance) {
            this._instance = new XFacService();
        }
        return this._instance;
    }

    async getUserToken(amount: number, mba: number, gameId: string, opponentId: number) {
        try {
            gameLog(gameId, 'req for xfac token', amount, mba)
            const proc_contest_name = "PROC_GetUserForXFacPlay_V2"
            let param_contest = `@Amount=${amount}, @BonusApplicable=${mba}, @UserId=${opponentId}, @RequestFrom='${gameId}'`;
            gameLog('xfacLog', 'Getting xfac for ', param_contest);
            let resp = await this.uow.GetDataFromTransaction(proc_contest_name, param_contest);
            gameLog('xfacLog', 'res xfac for ', param_contest, resp);
            gameLog(gameId, 'result from get user sp', resp);
            if (resp && resp.length > 0) {
                if(resp[0].ResponseStatus != 1){
                    // gameLog('Response status 0 in getUser SP', resp);
                    throw new Error("Unable to get xfac for user");
                }
                let token = await this.getToken(resp[0].UserId, gameId)
                return {
                    token: token,
                    xFacLevel: resp[0].XFacLevel,
                    xFacLogId: resp[0].XFacLogId
                }
            }
            throw new Error("Unable to fetch data from PROC_GetUserForXFacPlay_V2")
        } catch (err) {
            //console.log('Error in get xfac user', err);
            throw err
        }
    }

    async getToken(userId: string, gameId: string='default') {
        let reqUrl = `${process.env.XFAC_TOKEN_URL}?UserId=${userId}`
        let resp = await needle('get', reqUrl);
        // //console.log(resp)
        gameLog(gameId,  'token api resp', resp.body)
        if (resp.statusCode == 200) {
            return resp.body.access_token
        }
        throw new Error('Unable to get data from token API')
    }

    async saveXFacGameLog(data: XFacGameLog){
        try {
            const proc_contest_name = "PROC_CreateLudoXFacGameLog"
            let param_contest = `@UserId=${data.UserId}, @XFacId=${data.XFacId}, @XFacLevel=${data.XFacLevel}, @Result=${data.Result}, @RoomId=${data.RoomId}, @ContestId=${data.ContestId}, @XFacLogId=${data.xFacLogId}`;
            let resp = await this.uow.GetDataFromTransaction(proc_contest_name, param_contest);
        } catch (err) {
            console.log('Error in get xfac user', err);
            //console.log('Error in save xfac user log', err);
            throw err
        }       
    }
    async freeXfacUSer(userMid: string, gameId: string){
        try {
            const proc_contest_name = "PROC_UPDATE_LUDO_XFac_USER_STATUS"
            let param_contest = `@UserId=${userMid}`;
            gameLog(gameId, 'Freeing xfac user ');
            let resp = await this.uow.GetDataFromTransaction(proc_contest_name, param_contest);
            gameLog(gameId, 'Freeing xfac user resp ', resp);
            // if (resp && resp.length > 0) {
            //     if(resp[0].ResponseStatus != 1){
            //         throw new Error("Unable to free xfac for user");
            //     }
            //     return 
            // }
            // throw new Error("Unable to free xfac from PROC_UPDATE_LUDO_XFac_USER_STATUS")
        } catch (err) {
            gameLog(gameId, 'Error in Freeing xfac user ', err.toString());
            console.log('Error in free xfac user', err);
            throw err
        }
    }
}