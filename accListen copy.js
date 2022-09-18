
const Binance = require('node-binance-api');
const fs = require('fs');
const delay = require('delay');
var delayTime = 10 * 1000;
const pnlDB = require('cakebase')('./pnlDB.json')
const ListAccount = require('./account.json')
var accListen = []
main();
function main() {
    //make acc
    ListAccount.map(acc => {
        if (acc.status === true) {
            console.log(`Đăng ký acc ${acc.name} thành công`)
            accListen.push(
                {
                    binance:
                        new Binance().options({
                            APIKEY: acc.apikey,
                            APISECRET: acc.apisec,
                            useServerTime: true,
                            recvWindow: 60000,
                            verbose: true,
                        }),
                    name: acc.name
                }
            )
        }
    })
    getInfoAccount();

}


async function getPostion(acc) {
    return new Promise((resolve, reject) => {
        acc.futuresAccount().then(data => {
            let avaiPosition = data.positions.filter(position => {
                return parseFloat(position.entryPrice) > 0
            })
            delete data.assets;
            data.positions = avaiPosition;
            resolve(data);
        }).catch(err => {
            reject(err);
        })
    })
}
async function getOpenOrder(acc) {
    return new Promise((resolve, reject) => {
        acc.futuresOpenOrders().then(data => {
            resolve(data);
        }).catch(err => {
            reject(err);
        })
    })
}
async function oneGetInfoAccount(acc) {
    return new Promise(async (resolve, reject) => {
        try {
            let positions = await getPostion(acc.binance);
            let openorder = await getOpenOrder(acc.binance);
            let returnAccount = { ...positions, openorder, name: acc.name }
            resolve(returnAccount)
        } catch (err) {
            reject(err);
        }
    })
}

function getInfoAccount() {
    console.log('Get acction info')
    let listPromise = [];
    accListen.map(acc => {
        listPromise.push(oneGetInfoAccount(acc));
    })
    Promise.all(listPromise).then(async (data) => {
       
        for(let i=0;i<data.length;i++){
            let pnl=data[i]
            console.log(pnl)
            let isExist = await pnlDB.get(p=>p.name===pnl.name)
            console.log(isExist)
        }
       // await pnlDB.update(pnl => pnl.name === data.name);
        await delay(delayTime);
        getInfoAccount();
    }).catch(async (err) => {
        console.log('Error. Wait and again!!!')
        await delay(delayTime * 2);
        getInfoAccount();
    })
}
