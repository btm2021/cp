
const compression = require('compression');
const express = require('express')
const cors = require('cors')
const app = express()
const bodyParser = require('body-parser')
const PORT = process.env.PORT || 3000;
const fs = require('fs')
const cp = require('child_process');
var ListAccount = require('./account.json')
const pnlDB = require('cakebase')('./pnlDB.json')
const pro = require('process')
var listProcess = []
const websocketPORT = 3001
const tpcPORT = 8888
function exitHandler() {
    console.log("===Exit process===")
    listProcess.forEach(childProcess => {
        pro.kill(childProcess.pid)
    })
    pro.exit();
}

pro.on('SIGINT', exitHandler.bind());
//websocket
var listClientWS = [];
const WebSocket = require('ws');
const wss = new WebSocket.Server({
    port: websocketPORT
});
wss.on('connection', (ws) => {
    console.log('client connnect!')
    // listClientWS.push(ws);
    listClientWS.push(ws)

})
const sendAllWS = (msg) => {
    if (listClientWS.length > 0) {
        for (let i = 0; i < listClientWS.length; i++) {
            listClientWS[i].send(JSON.stringify(msg))
        }

    }
}
//MQ orderServer, ở đây làm channel main nhận msg từ các channel nhỏ và pub qua ws
//zeroMQ port 3333
var zmq = require('zeromq')
    , sock = zmq.socket('sub');

sock.connect('tcp://127.0.0.1:8080');
sock.subscribe('msg');
console.log('Subscriber connected to port 8888');

sock.on('message', (topic, message) => {
    let msg = message.toString("utf8")
    console.log(msg)
    sendAllWS(msg)
});

// module
var accListenModule = {
    app: null,
    status: 'stop'
}
var orderModule = {
    app: null,
    status: 'stop'
}

function startModule() {
    console.log('Start module')
    accListenModule.app = cp.fork('./accListen.js')
    accListenModule.status = 'run'
    orderModule.app = cp.fork('./orderServer.js')
    orderModule.status = 'run'
    listProcess.push({
        "name": "accListen",
        "pid": accListenModule.app.pid,
        "status": "run"
    }, {
        "name": "orderModule",
        "pid": orderModule.app.pid,
        "status": "run"
    }
    )
}
//
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
//app.use(morgan('combined'));
app.use(cors());
app.use(compression({
    level: 8,
    memLevel: 7,
}));
app.get('/', (req, res) => {
    res.send({ hello: "world" })
})
app.post('/acc', (req, res) => {
    //* chứa action của acc, xóa sửa thêm bớt
    let { action, idAccount, infoAccount } = req.body
    infoAccount = JSON.parse(infoAccount)
    switch (action) {
        case "add": {
            ListAccount.push(infoAccount);
            fs.writeFile("account.json", JSON.stringify(ListAccount), (data, err) => {
                if (err) {
                    res.send({ action, status: 404, ListAccount })
                } else {
                    res.send({ action, status: 200, ListAccount })
                }
            })
        } break;
        case "delete": {
            ListAccount = ListAccount.filter(acc => acc.id != idAccount)
            fs.writeFile("account.json", JSON.stringify(ListAccount), (data, err) => {
                if (err) {
                    res.send({ action, status: 404, ListAccount })
                } else {
                    res.send({ action, status: 200, ListAccount })
                }
            })
        } break;
        case "edit": {
            let itemIndex = ListAccount.findIndex(acc => acc.id === idAccount)
            ListAccount[itemIndex] = infoAccount
            fs.writeFile("account.json", JSON.stringify(ListAccount), (data, err) => {
                if (err) {
                    res.send({ action, status: 404, ListAccount })
                } else {
                    res.send({ action, status: 200, ListAccount })
                }
            })
        } break;
        case "read": {
            let item = ListAccount.find(acc => acc.id === idAccount)
            if (item) {
                res.send({ action, status: 200, item })
            } else {
                res.send({ action, status: 404, ListAccount })
            }

        } break;
        case "turnoff": {
            let itemIndex = ListAccount.findIndex(acc => acc.id === idAccount)
            ListAccount[itemIndex].status = false;
            fs.writeFile("account.json", JSON.stringify(ListAccount), (data, err) => {
                if (err) {
                    res.send({ action, status: 404, ListAccount })
                } else {
                    res.send({ action, status: 200, ListAccount })
                }
            })
        } break;
        case "turnon": {
            let itemIndex = ListAccount.findIndex(acc => acc.id === idAccount)
            ListAccount[itemIndex].status = true;
            fs.writeFile("account.json", JSON.stringify(ListAccount), (err) => {
                if (err) {
                    res.send({ action, status: 404, ListAccount })
                } else {
                    res.send({ action, status: 200, ListAccount })
                }
            })
        } break;
        case "setmaster": {
            ListAccount.forEach(item => {
                if (item.id === idAccount) {
                    item.role = "master"
                } else {
                    item.role = "slave"
                }
            })
            fs.writeFile("account.json", JSON.stringify(ListAccount), (data, err) => {
                if (err) {
                    res.send({ action, status: 404, ListAccount })
                } else {
                    res.send({ action, status: 200, ListAccount })
                }
            })
        } break;
        //* chỉ cho 1 master sau này tính sau
    }

})
app.post('/infoAccount', async (req, res) => {
    let { action, idAccount } = req.body
    switch (action) {
        case "one": {
            let account = await pnlDB.get(i => i.name === idAccount)
            res.json(account)
        } break;
        case "all": {
            let account = await pnlDB.get(i => { return true; })
            res.json(account)
        }
    }
})
// order
app.post('/order', async (req, res) => {
    sendToOrderServer({ action: "add" })
    res.send('ok')
})
app.post('/orderhuy', async (req, res) => {
    let { symbol, orderId, account } = req.body;
    let acc = listBinanceSlave.find(acc => acc.name === account);
    cancelOrder(symbol, orderId, acc).then(data => {
        if (data) {
            res.send({ status: true, data })
        } else {
            res.send({ status: false, data })
        }
    })
})
app.post('/orderthanhly', async (req, res) => {
    let { symbol, quantity, orderSide, account } = req.body;
    let acc = listBinanceSlave.find(acc => acc.name === account);
    thanhlyvithe(symbol, quantity, orderSide, acc).then(data => {
        if (data) {
            res.send({ status: true, data })
        } else {
            res.send({ status: false, data })
        }
    })
})
app.listen(PORT, err => {
    if (err) throw err;
    console.log("Server copytrade running at " + PORT);
    startModule()
});
const sendToOrderServer = (param) => {
    orderClient.send(['order', JSON.stringify(param)])
}


// var listBinanceSlave = [];
// var appStatus = "STOP"
// var appInfoServerStatus = "STOP"
// var wsProcess;
// var accProcess;

// app.post('/makeorder', async (req, res) => {
//   /** symbol: this.symbol,
//                                   quantity: parseFloat(soluongcoin),
//                                   side: side,
//                                   type: 'LIMIT',
//                                   donbay: this.donbay,
//                                   priceEntry: this.priceOrder,
//                                   listaccount: this.listaccount */
//   let { donbay, priceEntry, quantity, side, symbol, type, listaccount } = req.body;
//   console.log(donbay, priceEntry, quantity, side, symbol, type, listaccount);
//   let listAcc = []
//   listaccount.map(acc => {
//     listBinanceSlave.map(accAlready => {
//       if (accAlready.name === acc) {
//         listAcc.push(accAlready)
//       }
//     })
//   })
//   let result;
//   if (type === "LIMIT" && side === "SELL") {
//     //make short limit order
//     console.log("MAKE SELL LIMIT ORDER")
//     result = await makeSELLOrder(symbol, priceEntry, quantity, listAcc)
//   }
//   if (type === "LIMIT" && side === "BUY") {
//     //make long limit
//     console.log("MAKE BUY LIMIT ORDER")
//     result = await makeBUYOrder(symbol, priceEntry, quantity, listAcc)
//   }
//   res.send(result);
// })
// //app controler

// app.get('/appacclistenrestart', (req, res) => {
//   //force restart

// })
// app.get('/appacclistenstop', (req, res) => {
//   //force stop
//   stopInfoServer();
//   res.send({ appInfoServerStatus })
// })
// app.get('/appacclistenstart', (req, res) => {
//   //force start
//   startInfoServer();
//   res.send({ appInfoServerStatus })
// })
// app.get('/appacclistenstatus', (req, res) => {
//   if (accProcess && appInfoServerStatus === "RUN") {
//     getAppStatus(accProcess).then(data => {
//       res.send({
//         appStatus: appInfoServerStatus,
//         mem: data
//       })
//     })
//   } else {
//     res.send({ appInfoServerStatus, mem: null })
//   }
// })

// app.get('/apprestart', (req, res) => {
//   //force restart
//   stopWSserver
// })
// app.get('/appstop', (req, res) => {
//   //force stop
//   stopWSserver();

//   res.send({ appStatus })

// })
// app.get('/appstart', (req, res) => {
//   //force start
//   startWSserver();
//   res.send({ appStatus })
// })
// app.get('/appwslistenstatus', (req, res) => {
//   if (wsProcess && appStatus === "RUN") {
//     getAppStatus(wsProcess).then(data => {
//       res.send({
//         appStatus: appStatus,
//         mem: data
//       })
//     })
//   } else {
//     res.send({ appStatus, mem: null })
//   }
// })
// app.get('/appmainstatus', (req, res) => {
//   getOS().then(os => {
//     getAppStatus(process).then(process => {
//       res.send({ os, process })
//     })
//   })
// })
// //end app controller
// //account controlers

// //
// app.listen(PORT, err => {
//   startInitBinanceAcc();
//   startWSserver();
//   startInfoServer();
//   if (err) throw err;
//   console.log("Server copytrade running at " + PORT);
// });
// //function ultis.
// //account utils

// async function editAccount(req) {
//   return new Promise((resolve, reject) => {
//     let { name, info } = req
//     let accountIndex = ListAccount.findIndex(item => {
//       return item.name === name
//     })
//     if (accountIndex === -1) {
//       reject('[EDITACCOUNT]AccountNotExist')
//     } else {
//       ListAccount[accountIndex] = JSON.parse(info);
//       console.log(ListAccount)
//       fs.writeFile('accounts.json', JSON.stringify(ListAccount), (err) => {
//         if (err) {
//           reject("[EDITACCOUNT]WriteAccount.jsonError")
//         }
//         console.log("[EDITACCOUNT] write account.json complete!")
//         resolve("[EDITACCOUNT]EditAccountSuccess")
//       })

//     }
//   })
// }
// async function removeAccount(req) {
//   return new Promise((resolve, reject) => {
//     let { name } = req
//     let accountIndex = ListAccount.findIndex(item => {
//       return item.name === name
//     })

//     if (accountIndex === -1) {
//       reject('[REMOVEACCOUNT]AccountNotExist')
//     } else {
//       ListAccount = ListAccount.filter(item => item.name != name)
//       fs.writeFile('accounts.json', JSON.stringify(ListAccount), (err) => {
//         if (err) {
//           reject("[REMOVEACCOUNT]WriteAccount.jsonError")
//         }
//         console.log("[REMOVEACCOUNT] write account.json complete!")
//         resolve("[REMOVEACCOUNT]RemoveAccountSuccess")
//       })

//     }
//   })
// }
// async function addAccount(req) {
//   return new Promise((resolve, reject) => {
//     let { name, apikey, apisec, status, role } = req
//     //check name exists in ListAcc array
//     let isNameExists = ListAccount.find(item => {
//       return item.name === name
//     })
//     if (isNameExists) {
//       reject('[ADDACCOUNT]AccountExist')
//     } else {
//       console.log("[Account] Add Account to array complete!")
//       ListAccount.push({ name, apikey, apisec, status, role })
//       //async with file
//       fs.writeFile('accounts.json', JSON.stringify(ListAccount), (err) => {
//         if (err) {
//           reject("[ADDACCOUNT]WriteAccount.jsonError")
//         }
//         console.log("[Account] write account.json complete!")
//         resolve('[ADDACCOUNT]AccountAddComplete')
//       })

//     }
//   })
// }


// // main program

// //function utils
// //app util

// async function startInitBinanceAcc() {
//   //khoi tao toan bo account slave
//   let listSlave = ListAccount.filter(i => i.role === 'slave' && i.status === 'true');
//   listSlave.map(acc => {
//     listBinanceSlave.push({
//       binance:
//         new Binance().options({
//           APIKEY: acc.apikey,
//           APISECRET: acc.apisec,
//           useServerTime: true,
//           recvWindow: 60000,
//           verbose: true,
//         }),
//       name: acc.name
//     })
//   })
//   console.log('Khởi tạo thành công')
// }
// async function getAppStatus(child) {
//   return new Promise((resolve, reject) => {
//     pidusage(child.pid, function(err, stats) {
//       resolve(stats)
//     });
//   })

// }
// async function getOS() {
//   return new Promise((resolve, reject) => {
//     resolve({ cpu: os.cpus(), totalmem: os.totalmem(), freemem: os.freemem() })
//   })
// }
// function startWSserver() {
//   appStatus = "RUN"
//   wsProcess = cp.fork('./wsListen.js')
// }
// function stopWSserver() {
//   appStatus = "STOP"
//   wsProcess.emit('disconnect')
//   wsProcess.kill();
// }
// function startInfoServer() {
//   appInfoServerStatus = "RUN"
//   accProcess = cp.fork('./accListen.js')
// }
// function stopInfoServer() {
//   appInfoServerStatus = "STOP"
//   accProcess.emit('disconnect')
//   accProcess.kill();
// }
// //order util functionsasync function CheckPositionIsExist(acc, symbol) {
// async function CheckPositionIsExist(acc, symbol) {
//   return new Promise((resolve, reject) => {
//     acc.binance.futuresPositionRisk().then(data => {
//       let listPosition = data.filter(item => {
//         return parseFloat(item.positionAmt) !== 0
//       })
//       if (listPosition.length > 0) {
//         let item = listPosition.find(item1 => {
//           return item1.symbol === symbol
//         })
//         resolve(item);
//       } else {
//         resolve(null)
//       }
//     }).catch(err => reject);

//   })
// }
// async function CheckOrderIsExist(symbol, price, quantity, acc) {
//   return new Promise((resolve, reject) => {
//     acc.binance.futuresOpenOrders().then(data => {
//       let item1 = data.find(item => {
//         let price1 = parseFloat(item.price);
//         return (item.symbol === symbol && price1 === price)
//       })
//       if (item1) {
//         resolve(item1)
//       } else {
//         resolve(null)
//       }

//     }).catch(err => {
//       reject(err)
//     })

//   })
// }
// async function oneMakeSLOrder(symbol, price, acc, orderSide) {
//   return new Promise((resolve, reject) => {
//     CheckPositionIsExist(acc, symbol).then(data => {
//       if (data) {
//         acc.binance.futuresOrder(orderSide, symbol, Math.abs(data.notional), false,
//           {
//             type: 'STOP_MARKET',
//             workingType: 'CONTRACT_PRICE', stopPrice: price, closePosition: true
//           }).then(data => {
//             console.log(`[SLAVE] ${acc.name} Tạo SL Order  ${symbol}:${price} *SUCCESS`)
//             let message = `[ORDER]-Tạo STOP_LOST ORDER ${symbol}:${price}:${acc.name}:${new Date().getTime()} *SUCCESS`
//             pnSend("MARKET", message);
//             resolve(data)
//           }).catch(err => {
//             console.log(err)
//           })
//       } else {
//         resolve(null)
//       }
//     })

//   })
// }
// async function oneMakeTPOrder(symbol, price, acc, orderSide) {
//   return new Promise((resolve, reject) => {
//     CheckPositionIsExist(acc, symbol).then(data => {
//       if (data) {
//         acc.binance.futuresOrder(orderSide, symbol, Math.abs(data.notional), false,
//           {
//             type: 'TAKE_PROFIT_MARKET',
//             workingType: 'CONTRACT_PRICE', stopPrice: price, closePosition: true
//           }).then(data => {
//             console.log(`[SLAVE] ${acc.name} Tạo TP Order  ${symbol}:${price} *SUCCESS`)
//             let message = `[ORDER]-Tạo TAKE_PROFIT ORDER ${symbol}:${price}:${acc.name}:${new Date().getTime()} *SUCCESS`
//             pnSend("MARKET", message);
//             resolve(data)
//           }).catch(err => {
//             console.log(err)
//           })
//       } else {
//         resolve(null)
//       }
//     })

//   })
// }
// async function makeSELLOrder(symbol, price, quantity, acc) {
//   return new Promise(function(resolve, reject) {
//     let listPromise = [];
//     acc.map(_acc => {
//       listPromise.push(oneMakeSELLOrder(symbol, price, quantity, _acc))
//     })
//     Promise.all([listPromise]).then(data => {

//       resolve(data)
//     }).catch(err => {
//       reject(err)
//     })
//   })
// }
// async function oneMakeSELLOrder(symbol, price, quantity, acc) {
//   return new Promise((resolve, reject) => {
//     console.log(symbol, price, quantity)
//     acc.binance.futuresSell(symbol, quantity, price).then(data => {
//       console.log(data)
//       if (data.code === -1111) {
//         reject({ acc: acc.name, error: data })
//       } else {
//         resolve(data)
//       }
//     }).catch(err => {
//       reject({ acc: acc.name, error: err })
//     });
//   })
// }
// async function oneMakeBUYOrderMaket(symbol, quantity, acc) {
//   return new Promise((resolve, reject) => {
//     CheckPositionIsExist(acc, symbol).then(data => {
//       if (data) {
//         console.log(data)
//         acc.binance.futuresMarketBuy(symbol, quantity, { reduce: true }).then(data => {
//           let message = `[ORDER]-Thanh lý Vị thế SHORT ${symbol}:${data.unRealizedProfit}:${acc.name}:${new Date().getTime()} *SUCCESS`
//           pnSend("MARKET", message);
//           resolve(data)
//         }).catch(err => {
//           let message = `[ORDER]-Thanh lý Vị thế SHORT ${symbol}:${data.unRealizedProfit}:${acc.name}:${new Date().getTime()} *FAIL`
//           pnSend("MARKET", message);
//           reject(err)
//         })
//       } else {
//         resolve(null)
//       }
//     })
//   })
// }
// async function oneMakeBUYOrderMaket(symbol, quantity, acc) {
//   return new Promise((resolve, reject) => {
//     CheckPositionIsExist(acc, symbol).then(data => {
//       if (data) {
//         console.log(data)
//         acc.binance.futuresMarketBuy(symbol, quantity, { reduce: true }).then(data => {
//           let message = `[ORDER]-Thanh lý Vị thế SHORT ${symbol}:${data.unRealizedProfit}:${acc.name}:${new Date().getTime()} *SUCCESS`
//           pnSend("MARKET", message);
//           resolve(data)
//         }).catch(err => {
//           let message = `[ORDER]-Thanh lý Vị thế SHORT ${symbol}:${data.unRealizedProfit}:${acc.name}:${new Date().getTime()} *FAIL`
//           pnSend("MARKET", message);
//           reject(err)
//         })
//       } else {
//         resolve(null)
//       }
//     })
//   })
// }
// async function makeBUYOrder(symbol, price, quantity, acc) {
//   return new Promise(function(resolve, reject) {
//     let listPromise = [];
//     acc.map(_acc => {
//       listPromise.push(oneMakeBUYOrder(symbol, price, quantity, _acc))
//     })
//     Promise.all([listPromise]).then(data => {
//       resolve(data)
//     }).catch(err => {
//       reject(err)
//     })
//   })
// }

// async function oneMakeBUYOrder(symbol, price, quantity, acc) {
//   return new Promise((resolve, reject) => {
//     acc.binance.futuresBuy(symbol, quantity, price).then(data => {

//       resolve(data)
//     }).catch(err => {
//       reject(err)
//     });
//   })
// }
// async function oneMakeCANCELOrder(symbol, price, quantity, acc) {
//   //check order in account 
//   return new Promise((resolve, reject) => {
//     CheckOrderIsExist(symbol, price, quantity, acc).then(data => {
//       if (data) {
//         //co order
//         let _orderSymbol = data.symbol;
//         let _orderID = data.orderId
//         acc.binance.futuresCancel(_orderSymbol, { orderId: _orderID }).then(data => {
//           console.log('Huy thanh cong')
//           let message = `[ORDER]- Hủy Order ${symbol}:${price}:${quantity}:${acc.name}:${new Date().getTime()} *SUCCESS`
//           pnSend("MARKET", message);
//           resolve('huy thanh cong')
//         }).catch(err => {
//           let message = `[ORDER]- Hủy Order ${symbol}:${price}:${quantity}:${acc.name}:${new Date().getTime()} *FAIL`
//           pnSend("MARKET", message);
//           reject('loi')
//         })
//       } else {
//         resolve(null)
//       }
//     })
//   })

// }
// async function cancelOrder(symbol, orderId, acc) {
//   return new Promise((resolve, reject) => {
//     acc.binance.futuresCancel(symbol, { orderId }).then(data => {
//       console.log('Huy thanh cong')
//       resolve('huy thanh cong')
//     }).catch(err => {
//       resolve(null)
//     })
//   })

// }
// async function thanhlyvithe(symbol, quantity, orderSide, acc) {
//   return new Promise((resolve, reject) => {
//     if (orderSide === "SELL") {
//       acc.binance.futuresMarketBuy(symbol, quantity, { reduce: true }).then(data => {
//         console.log("huy SHORT thanh cong")
//         resolve(data)
//       }).catch(err => {
//         reject(err)
//       })
//     } else {
//       acc.binance.futuresMarketSell(symbol, quantity, { reduce: true }).then(data => {
//         console.log('huy LONG thanh cong')
//         resolve(data)
//       }).catch(err => {
//         reject(err)
//       })
//     }
//   })

// } 