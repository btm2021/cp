var zmq = require('zeromq')
    , sock = zmq.socket('pub');

sock.bindSync('tcp://127.0.0.1:8080');
console.log('Publisher bound to port 3000');

const { WebsocketClient } = require('binance');
const Binance = require('node-binance-api');
console.log = (msg) => {
    sock.send(["msg", JSON.stringify(msg)])
}

//lắng nghe từ client 


var _sock = zmq.socket('sub');
_sock.bindSync('tcp://127.0.0.1:8081');
_sock.subscribe('order');
_sock.on("message", (topic, message) => {
    let body = JSON.parse(message.toString("utf8"))
    let { action } = body;
    switch (action) {
        case "deleteorder": {
            let { orderId, symbol,account } = body;
            let acc = listFullAccount.find(i => i.name === account);
            acc.binance.futuresCancel(symbol, { orderId: orderId }).then(data => {
                let _message = `[ORDER]- Hủy Order ${symbol}:${acc.name}:${new Date().getTime()} *SUCCESS`
                console.log(_message)
            }).catch(err => {
                let _message = `[ORDER]- Hủy Order ${symbol}:${acc.name}:${new Date().getTime()} *FAIL`
                console.log(message)
            })
        } break;
        case "thanhlyvithe": {
            let { orderId, symbol,account } = body;
            let acc = listFullAccount.find(i => i.name === account);
            acc.binance.futuresCancel(symbol, { orderId: orderId }).then(data => {
                let _message = `[ORDER]- Hủy Order ${symbol}:${acc.name}:${new Date().getTime()} *SUCCESS`
                console.log(_message)
            }).catch(err => {
                let _message = `[ORDER]- Hủy Order ${symbol}:${acc.name}:${new Date().getTime()} *FAIL`
                console.log(message)
            })
        } break;
    }
})

/*
- xong. refactor các function thành promise
- xong. lam lai tinh nang cat khong quay dau
- xong. lam tinh nang dat sl, tp 
_ xong. lam tinh nang phan biet dat tu client va master - xong. client tu dien thoai co _
_ xong. them push - xong. channel crypto
-----------
tool bcs
*/

console.log("WSListen running...")
ListAccount = require('./configfolder/account.json')
var accMaster;
var wsMaster;
var accSlave = [];
var listFullAccount = []
function main() {
    //make acc
    ListAccount.map(acc => {
        if (acc.status) {
            listFullAccount.push({
                binance:
                    new Binance().options({
                        APIKEY: acc.apikey,
                        APISECRET: acc.apisec,
                        useServerTime: true,
                        recvWindow: 60000,
                        verbose: true,
                    }),
                name: acc.name
            })
        }
        if (acc.role === "slave" && acc.status === true) {
            console.log(`Đăng kí acc slave ${acc.name}`)
            accSlave.push(
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
        if (acc.role === "master" && acc.status === true) {
            console.log(`Đăng kí acc Master ${acc.name}`)
            accMaster = acc;
            wsMaster = new WebsocketClient({
                api_key: acc.apikey,
                api_secret: acc.apisec,
                beautify: true,
            });

        }
    })

    initWebSocket();
}

function initWebSocket() {
    if (wsMaster) {
        wsMaster.on('open', (data) => {
            console.log("*** Khởi tạo lắng nghe trên acc master " + accMaster.name)
        });
        wsMaster.on('formattedMessage', (data) => {

            if (data.eventType === "ORDER_TRADE_UPDATE") {
                event_ORDER_TRADE_UPDATE(data)
            }
            if (data.eventType === "ACCOUNT_CONFIG_UPDATE") {
                if (data.assetConfiguration.symbol && data.assetConfiguration.leverage) {
                    changeLeverage(data.assetConfiguration.symbol, data.assetConfiguration.leverage)
                }
            }
        });
        wsMaster.subscribeUsdFuturesUserDataStream();
    }
}
function event_ORDER_TRADE_UPDATE(data) {
    let client = data.order.clientOrderId;

    if (client.includes("_")) {
        console.log('order phone')
        if (data.order.orderStatus === "NEW" && data.order.orderType === 'LIMIT') {
            let symbol = data.order.symbol;
            let price = data.order.originalPrice;
            let quantity = data.order.originalQuantity;

            if (data.order.orderSide === "BUY") {
                //long
                makeBUYOrder(symbol, price, quantity)
            }
            if (data.order.orderSide === "SELL") {
                //short
                makeSELLOrder(symbol, price, quantity)
            }
        }
        //Hủy Order 
        if (data.order.orderStatus === "CANCELED" && data.order.orderType === 'LIMIT') {
            console.log('Master hủy order ' + data.order.orderId)
            makeCANCELOrder(data);
        }
        //TP order
        if (data.order.orderType === "TAKE_PROFIT_MARKET") {
            if (data.order.executionType === "CANCELED") {
                makeCANCELOrder(data);
            }
            if (data.order.executionType === "NEW") {
                makeTPOrder(data)
            }
        }
        //SL order
        if (data.order.orderType === "STOP_MARKET") {
            if (data.order.executionType === "CANCELED") {
                makeCANCELOrder(data);
            }
            if (data.order.executionType === "NEW") {
                makeSLOrder(data)
            }
        }
        //thanh lý bằng giá market 
        if (data.order.orderStatus === "NEW" && data.order.orderType === "MARKET") {
            let symbol = data.order.symbol;
            let quantity = data.order.originalQuantity;
            console.log("Master thanh lý " + symbol)
            if (data.order.orderSide === "BUY") {
                makeBUYorderMarket(symbol, quantity)
            }
            if (data.order.orderSide === "SELL") {
                makeSELLorderMarket(symbol, quantity)
            }
        }
    } else {
        console.log('order from client web')
    }
}

function changeLeverage(symbol, leverage) {
    console.log('Master thay đổi đòn bẩy')
    let listPromise = [];
    accSlave.map(acc => {
        listPromise.push(oneChangeLeverage(symbol, leverage, acc));
        Promise.all([listPromise]).then(data => {

        })
    })
}

async function oneChangeLeverage(symbol, leverage, acc) {
    return new Promise((resolve, reject) => {
        acc.binance.futuresLeverage(symbol, leverage).then(data => {
            console.log(`[Đòn bẩy]- Thay đổi đòn bẩy trên acc ${acc.name} + ${symbol} + X${leverage}  *SUCCESS`)
        }).catch(err => {
            console.log(`[Đòn bẩy]- Thay đổi đòn bẩy trên acc ${acc.name} + ${symbol} + X${leverage}  *FAIL`)

        })
    })
}
async function CheckPositionIsExist(acc, symbol) {
    return new Promise((resolve, reject) => {
        acc.binance.futuresPositionRisk().then(data => {
            let listPosition = data.filter(item => {
                return parseFloat(item.positionAmt) !== 0
            })
            if (listPosition.length > 0) {
                let item = listPosition.find(item1 => {
                    return item1.symbol === symbol
                })
                resolve(item);
            } else {
                resolve(null)
            }
        }).catch(err => reject);

    })
}
async function CheckOrderIsExist(symbol, price, quantity, acc) {
    return new Promise((resolve, reject) => {
        acc.binance.futuresOpenOrders().then(data => {
            let item1 = data.find(item => {
                let price1 = parseFloat(item.price);
                return (item.symbol === symbol && price1 === price)
            })
            if (item1) {
                resolve(item1)
            } else {
                resolve(null)
            }

        }).catch(err => {
            reject(err)
        })

    })
}

async function oneMakeBUYOrderMaket(symbol, quantity, acc) {
    return new Promise((resolve, reject) => {
        CheckPositionIsExist(acc, symbol).then(data => {
            if (data) {
                acc.binance.futuresMarketBuy(symbol, quantity, { reduce: true }).then(data => {
                    let message = `[ORDER]-Thanh lý Vị thế SHORT ${symbol}:${data.unRealizedProfit}:${acc.name}:${new Date().getTime()} *SUCCESS`
                    console.log(message)
                    resolve(data)
                }).catch(err => {
                    let message = `[ORDER]-Thanh lý Vị thế SHORT ${symbol}:${data.unRealizedProfit}:${acc.name}:${new Date().getTime()} *FAIL`
                    console.log(message)
                    reject(err)
                })
            } else {
                resolve(null)
            }
        })
    })
}
function makeBUYorderMarket(symbol, quantity) {
    console.log(`[Master] Tạo Order Market SELL(SHORT) Cho Cặp: ${symbol} - Số lượng : ${quantity}`)
    let listPromise = [];
    accSlave.map(acc => {
        listPromise.push(oneMakeBUYOrderMaket(symbol, quantity, acc))
    })
    Promise.all([listPromise]).then(data => {
        console.log('[SLAVE] Thanh lý vị thế SHORT thành công order')

    })
}
async function oneMakeSELLOrderMarket(symbol, quantity, acc) {
    return new Promise((resolve, reject) => {
        CheckPositionIsExist(acc, symbol).then(data => {
            if (data) {
                acc.binance.futuresMarketSell(symbol, quantity, { reduce: true }).then(data => {
                    let message = `[ORDER]-Thanh lý Vị thế SHORT ${symbol}:${data.unRealizedProfit}:${acc.name}:${new Date().getTime()} *SUCCESS`
                    console.log(message)
                    resolve(data)
                }).catch(err => {
                    let message = `[ORDER]-Thanh lý Vị thế SHORT ${symbol}:${data.unRealizedProfit}:${acc.name}:${new Date().getTime()} *FAIL`
                    console.log(message)
                    reject(err)
                })
                resolve(null)
            }
        })
    })
}
function makeSELLorderMarket(symbol, quantity) {
    console.log(`[Master] Tạo Order Market SELL(SHORT) Cho Cặp: ${symbol} - Số lượng : ${quantity}`)
    let listPromise = [];
    accSlave.map(acc => {
        listPromise.push(oneMakeSELLOrderMarket(symbol, quantity, acc))
    })
    Promise.all([listPromise]).then(data => {
        console.log('[SLAVE] Thanh lý vị thế LONG thành công order')

    })
}

async function oneMakeBUYOrder(symbol, price, quantity, acc) {
    return new Promise((resolve, reject) => {
        acc.binance.futuresBuy(symbol, quantity, price).then(data => {
            if (data.code === -1111) {
                let message = `[ORDER]- Tạo ORDER BUY(LONG) ${symbol}:${price}:${quantity}:${acc.name}:${new Date().getTime()} * FAIL`

                reject('error ' + acc.name)
            } else {
                let message = `[ORDER]- Tạo ORDER BUY(LONG) ${symbol}:${price}:${quantity}:${acc.name}:${new Date().getTime()} *SUCCESS`
                console.log(message)
                resolve(data)
            }

        }).catch(err => {
            let message = `[ORDER]- Tạo ORDER BUY(LONG) ${symbol}:${price}:${quantity}:${acc.name}:${new Date().getTime()} * FAIL`
            console.log(message)

            reject('error ' + acc.name)
        });
    })
}
function makeBUYOrder(symbol, price, quantity) {
    console.log(`[Master] Tạo Order BUY(LONG) Cho Cặp: ${symbol} - Giá : ${price} - Số lượng : ${quantity}`)
    let listPromise = [];
    accSlave.map(acc => {
        listPromise.push(oneMakeBUYOrder(symbol, price, quantity, acc));
    })
    Promise.all([listPromise]).then(data => {
        console.log('[SLAVE] Tạo thành công order Buy(LONG)')
    })
}

async function oneMakeSELLOrder(symbol, price, quantity, acc) {
    return new Promise((resolve, reject) => {
        acc.binance.futuresSell(symbol, quantity, price).then(data => {
            if (data.code === -1111) {
                let message = `[ORDER]- Tạo ORDER SELL(SHORT) ${symbol}:${price}:${quantity}:${acc.name}:${new Date().getTime()} *FAIL`
                console.log(message)
                reject({ acc: acc.name, error: data })
            } else {
                let message = `[ORDER]- Tạo ORDER SELL(SHORT) ${symbol}:${price}:${quantity}:${acc.name}:${new Date().getTime()} *SUCCESS`
                console.log(message)
                resolve(data)
            }

        }).catch(err => {
            let message = `[ORDER]- Tạo ORDER SELL(SHORT) ${symbol}:${price}:${quantity}:${acc.name}:${new Date().getTime()} *FAIL`
            console.log(message)
            reject({ acc: acc.name, error: err })
        });
    })
}
function makeSELLOrder(symbol, price, quantity) {
    console.log(`[Master] Tạo Order SELL(SHORT) Cho Cặp: ${symbol} - Giá : ${price} - Số lượng : ${quantity}`)
    let listPromise = [];
    accSlave.map(acc => {
        listPromise.push(oneMakeSELLOrder(symbol, price, quantity, acc));
    })
    Promise.all([listPromise]).then(data => {
        console.log('[SLAVE] Tạo thành công order Buy(LONG)')
    })
}

async function oneMakeCANCELOrder(symbol, price, quantity, acc) {
    //check order in account 
    return new Promise((resolve, reject) => {
        CheckOrderIsExist(symbol, price, quantity, acc).then(data => {
            if (data) {
                //co order
                let _orderSymbol = data.symbol;
                let _orderID = data.orderId
                acc.binance.futuresCancel(_orderSymbol, { orderId: _orderID }).then(data => {
                    let message = `[ORDER]- Hủy Order ${symbol}:${price}:${quantity}:${acc.name}:${new Date().getTime()} *SUCCESS`
                    console.log(message)
                    resolve('huy thanh cong')
                }).catch(err => {
                    let message = `[ORDER]- Hủy Order ${symbol}:${price}:${quantity}:${acc.name}:${new Date().getTime()} *FAIL`

                    console.log(message)
                    reject('loi')
                })
            } else {
                resolve(null)
            }
        })
    })

}
function makeCANCELOrder(data) {
    let symbol = data.order.symbol;
    let price = data.order.originalPrice;
    let quantity = data.order.originalQuantity;
    let listPromise = [];
    let message = `[ORDER]-Master Hủy Order ${symbol}:${price}:${quantity}:${new Date().getTime()}`
    console.log(message)
    accSlave.map(acc => {
        listPromise.push(oneMakeCANCELOrder(symbol, price, quantity, acc))
    })
    Promise.all([listPromise]).then(data => {
        console.log('[SLAVE] Hủy order thành công')
    })

}
async function oneMakeTPOrder(symbol, price, acc, orderSide) {
    return new Promise((resolve, reject) => {
        CheckPositionIsExist(acc, symbol).then(data => {
            if (data) {
                acc.binance.futuresOrder(orderSide, symbol, Math.abs(data.notional), false,
                    {
                        type: 'TAKE_PROFIT_MARKET',
                        workingType: 'CONTRACT_PRICE', stopPrice: price, closePosition: true
                    }).then(data => {
                        let message = `[ORDER]-Tạo TAKE_PROFIT ORDER ${symbol}:${price}:${acc.name}:${new Date().getTime()} *SUCCESS`
                        console.log(msg)

                        resolve(data)
                    }).catch(err => {
                        console.log(err)
                    })
            } else {
                resolve(null)
            }
        })

    })
}

function makeTPOrder(data) {
    let orderSide = data.order.orderSide;
    let symbol = data.order.symbol;
    let price = data.order.stopPrice;
    let listPromise = [];

    let message = `[ORDER]-Master Tạo TAKE_PROFIT ORDER ${symbol}:${price}:${new Date().getTime()}`
    console.log(message)
    accSlave.map(acc => {
        listPromise.push(oneMakeTPOrder(symbol, price, acc, orderSide));
    })
    Promise.all([listPromise]).then(data => {
        console.log('[SLAVE] Tạo thành công order TP ' + orderSide)
    })

}
async function oneMakeSLOrder(symbol, price, acc, orderSide) {
    return new Promise((resolve, reject) => {
        CheckPositionIsExist(acc, symbol).then(data => {
            if (data) {
                acc.binance.futuresOrder(orderSide, symbol, Math.abs(data.notional), false,
                    {
                        type: 'STOP_MARKET',
                        workingType: 'CONTRACT_PRICE', stopPrice: price, closePosition: true
                    }).then(data => {
                        let message = `[ORDER]-Tạo STOP_LOST ORDER ${symbol}:${price}:${acc.name}:${new Date().getTime()} *SUCCESS`
                        console.log(message)
                        resolve(data)
                    }).catch(err => {
                        console.log(err)
                    })
            } else {
                resolve(null)
            }
        })

    })
}
function makeSLOrder(data) {
    let orderSide = data.order.orderSide;
    let symbol = data.order.symbol;
    let price = data.order.stopPrice;

    let listPromise = [];
    let message = `[ORDER]-Master Tạo STOP_LOST ORDER ${symbol}:${price}:${new Date().getTime()}`
    console.log(message)
    accSlave.map(acc => {
        listPromise.push(oneMakeSLOrder(symbol, price, acc, orderSide));
    })
    Promise.all([listPromise]).then(data => {
        console.log('[SLAVE] Tạo thành công order SL ' + orderSide)
    })

}
//Tool BSC

main();