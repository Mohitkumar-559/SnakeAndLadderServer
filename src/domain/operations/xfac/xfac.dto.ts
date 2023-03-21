export interface XFacGameLog{
    UserId: number,
    XFacId: number,
    XFacLevel: number,
    Result: boolean,
    RoomId: number,
    ContestId: number,
    xFacLogId: number
}


export const EmojiReply = {
    12: [10,16,17,14,15],
    13: [10,16,17,14,15],
    18: [10,16,17,14,15],
    21: [10,16,17,14,15],
    10: [12,13,18,21],
    16: [12,13,18,21],
    17: [12,13,18,21],
    14: [12,13,18,21],
    15: [12,13,18,21],
    11: [12,13,18,21],
    1: [1,8,4],
    2: [6,9,4],
    3: [8,7,4],
    4: [9,6,8],
    5: [8,6,7],
    6: [1,9,6],
    7: [8,9,6],
    8: [8,9,6],
    9: [6,3,8],
}