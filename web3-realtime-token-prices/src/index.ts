// Copyright 2021 MoneyR.io or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

// default imports
import { Environment, IEthChain, ILambdaEvent, ITokenPrice } from '@moneyrio/common';
import { LambdaServerUtils } from '@moneyrio/common-lambda';
import { PancakeAPI, TokenPricesAPI } from '@moneyrio/exchanges-api';
import { SaveTokenPricesToDB, GetTokenPricesFromDB } from '../../common/price-feed';
import { RedisCache } from '../../common/redis-client';

const SUPPORTED_CHAINS = new Array<IEthChain>();
SUPPORTED_CHAINS.push({ name: 'BSC' });

const BUFFER_KEY = "uBuffer";
function isValidRequest(body) {
  return true;
}

async function getTokenPrice(address: string, apiclient: TokenPricesAPI): Promise<{ address: string, price: number }> {
  let current_price: number = 0;
  try {
    let response = await apiclient.get_token_price(address);
    current_price = Number(response.content.data.price);
  }
  catch (err) {
    console.log("error happened" + err.name);
  }
  return { address: address, price: current_price };
}

async function updatePricesData(event: ILambdaEvent): Promise<any> {
  console.log("updatePricesData start");

  const client = new RedisCache(Environment.config.redis.PORT, Environment.config.redis.REDIS_SERVER_HOST);
  // console.log(typeof(client));
  console.log(client.isConnected());
  console.log(JSON.stringify(client.isConnected()));
  console.log("OK");
  if (true || false) {
    for (let chain of SUPPORTED_CHAINS) {
      console.log("GetTokenPricesFromDB START");
      let tokenList: Array<ITokenPrice> = await GetTokenPricesFromDB(chain);
      console.log("GetTokenPricesFromDB END");
      console.log("BUFFER_KEY START");
      let buffer = await client.getValue(BUFFER_KEY + chain.name);
      console.log("BUFFER_KEY END");
      if (buffer !== null) {
        console.log((buffer as Array<ITokenPrice>).length);
        if (tokenList !== undefined) {
          (buffer as Array<ITokenPrice>).forEach(element => {
            tokenList.push(element);
          });    
        }
        else{
          tokenList = (buffer as Array<ITokenPrice>)
        }
        await client.deleteValue(BUFFER_KEY + chain.name);
        await SaveTokenPricesToDB(tokenList, chain);
      }
      let api: TokenPricesAPI;
      if (chain.name === "BSC") {
        api = new PancakeAPI({
          api: Environment.config.pancake.API_DEV
        })
      };
      try {
        if (tokenList !== undefined && tokenList !== null) {
          let pricePromisesArray = new Array<Promise<any>>();
          let result_prices = new Array<{ address: string, price: number }>();
          for (let t of tokenList) {
            pricePromisesArray.push(getTokenPrice(t.address, api)
              .then(res => {
                result_prices.push(res);
              }));
          }
          await Promise.allSettled(pricePromisesArray);

          let settingPriceArray = new Array<Promise<any>>();
          for (let p of result_prices) {
            settingPriceArray.push(client.setValue(`${chain.name}${p.address}`, p.price.toString()));
          }
          await Promise.allSettled(settingPriceArray);
        }
      }
      catch (err) {
        console.error("Error happened" + err.name);
        continue;
      }
    }
  }
  return true;
}

exports.web3UpdatePriceData = LambdaServerUtils.lambdaHandler<any, any>({
  dimensions: "web3UpdatePriceData",
  namespace: Environment.config.aws.METRICS_NAMESPACE,
  isValidRequest: obj => isValidRequest(obj),
  getData: async (event, obj) => await updatePricesData(obj)
});

