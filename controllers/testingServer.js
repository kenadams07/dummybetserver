const Bet = require("../models/Bet");
const maxLimitBetMatchingINR = parseFloat(process.env.MAXLIMITBETMATCHINGINR);
const maxLimitBetMatchingGBP = maxLimitBetMatchingINR * 0.00813;
const repetitionToMatchBet = parseInt(process.env.REPETATIONTOMATCHBET, 10);
const percentageEachBet = parseFloat(process.env.PERCENTAGEEACHBET);

const betIdgenerate = () => {
  const prefix = "3";
  const randomNumber = Math.floor(Math.random() * 10 ** 11);
  const betId = prefix + randomNumber.toString().padStart(11, "0");
  return parseInt(betId, 10);
};

module.exports = {
  placebet: async (req, res) => {
    try {
      const { marketId, customerRef, instructions } = req.body;

      
      const instructionReports = instructions.map((instruction) => {
        const orderStatus = instruction.limitOrder.size >= maxLimitBetMatchingGBP ? "EXECUTABLE" : "EXECUTION_COMPLETE";
        return {
          ...instruction,
          betId: betIdgenerate(),
          placedDate: new Date(),
          sizeMatched: orderStatus === "EXECUTION_COMPLETE" ? instruction.limitOrder.size : 0,
          averagePriceMatched: orderStatus === "EXECUTION_COMPLETE" ? instruction.limitOrder.price : 0,
          sizeRemaining: instruction.limitOrder.size,
          orderStatus,
          limitOrder: {
            ...instruction.limitOrder,
            persistenceType: "LAPSE"
          }
        };
      });

      const matchBet = await Bet.create({
        marketId,
        customerRef,
        instructions: instructionReports
      });

      res.status(200).send({
        customerRef: matchBet.customerRef,
        status: "SUCCESS",
        marketId: matchBet.marketId,
        instructionReports: instructionReports.map((instruction) => ({
          status: "SUCCESS",
          instruction: {
            selectionId: instruction.selectionId,
            handicap: instruction.handicap,
            limitOrder: instruction.limitOrder,
            customerOrderRef: instruction.customerOrderRef,
            orderType: instruction.orderType,
            side: instruction.side
          },
          betId: instruction.betId,
          placedDate: instruction.placedDate,
          averagePriceMatched: instruction.averagePriceMatched,
          sizeMatched: instruction.sizeMatched,
          orderStatus: instruction.orderStatus
        }))
      });
    } catch (error) {
      console.error("Error processing match bet:", error);
      res.status(500).send({ error: "Something went wrong!" });
    }
  },

  checkstatus: async (req, res) => {
    try {
      const { customerOrderRefs } = req.body;
      
      const bets = await Bet.find(
        { 'instructions.customerOrderRef': { $in: customerOrderRefs } },
        { instructions: 1, marketId: 1, matchVersion: 1 }
      ).lean();

      if (!bets.length) {
        return res.status(404).send({ error: "No matching bets found" });
      }

      const firstTimeBets = bets.filter(bet => bet.matchVersion === 0);
      if (firstTimeBets.length) {
        const firstTimeOrders = firstTimeBets.flatMap(bet =>
          bet.instructions.map(instruction => ({
            betId: instruction.betId,
            marketId: bet.marketId,
            selectionId: instruction.selectionId,
            handicap: instruction.handicap,
            priceSize: {
              price: instruction.limitOrder.price,
              size: instruction.limitOrder.size,
            },
            bspLiability: 0,
            side: instruction.side,
            status: 'EXECUTABLE',
            persistenceType: instruction.limitOrder.persistenceType,
            orderType: instruction.orderType,
            placedDate: instruction.placedDate,
            matchedDate: null,
            averagePriceMatched: 0,
            sizeMatched: 0,
            sizeRemaining: instruction.limitOrder.size, 
            sizeLapsed: 0,
            sizeCancelled: 0,
            sizeVoided: 0,
            regulatorCode: "MALTA LOTTERIES AND GAMBLING AUTHORITY",
            customerOrderRef: instruction.customerOrderRef
          }))
        );
  
        await Bet.updateMany(
          { _id: { $in: firstTimeBets.map(bet => bet._id) } },
          { $set: { matchVersion: 1 } }
        );
  
        return res.status(200).send({
          currentOrders: firstTimeOrders,
          moreAvailable: false
        });
      }
      
      
      const updateOperations = bets.map((bet) => {
        const updatedInstructions = bet.instructions.map((instruction) => {
          if (customerOrderRefs.includes(instruction.customerOrderRef)) {
            const totalSize = instruction.limitOrder.size;
            const currentMatchVersion = bet.matchVersion;

            if (currentMatchVersion < repetitionToMatchBet) {
              const incrementAmount = totalSize * percentageEachBet;
              instruction.sizeMatched += incrementAmount;
              instruction.sizeRemaining = totalSize - instruction.sizeMatched;

              if (currentMatchVersion === repetitionToMatchBet - 1) {
                instruction.sizeMatched = totalSize;
                instruction.sizeRemaining = 0;
                instruction.orderStatus = 'EXECUTION_COMPLETE';
              }
            } else {
              instruction.sizeRemaining = 0;
              instruction.orderStatus = 'EXECUTION_COMPLETE';
            }
          }
          return instruction;
        });

        return {
          updateOne: {
            filter: { _id: bet._id, matchVersion: bet.matchVersion },
            update: { instructions: updatedInstructions, $inc: { matchVersion: 1 } }
          }
        };
      });

      await Bet.bulkWrite(updateOperations);

      bets.forEach((bet) => {
        bet.instructions = bet.instructions.filter(
          (instruction) => instruction.orderStatus !== "CANCELLED"
        );
      });
      
      const responseOrders = bets.flatMap((bet) =>
        bet.instructions.map((instruction) => {
          return {
            betId: instruction.betId,
            marketId: bet.marketId,
            selectionId: instruction.selectionId,
            handicap: instruction.handicap,
            priceSize: {
              price: instruction.limitOrder.price,
              size: instruction.limitOrder.size,
            },
            bspLiability: 0,
            side: instruction.side,
            status: instruction.orderStatus,
            persistenceType: instruction.limitOrder.persistenceType,
            orderType: instruction.orderType,
            placedDate: instruction.placedDate,
            matchedDate: new Date(),
            averagePriceMatched: instruction.limitOrder.price,
            sizeMatched: +((instruction.sizeMatched)?.toFixed(2)),
            sizeRemaining: +((instruction.sizeRemaining)?.toFixed(2)),
            sizeLapsed: 0,
            sizeCancelled: 0,
            sizeVoided: 0,
            regulatorCode: "MALTA LOTTERIES AND GAMBLING AUTHORITY",
            customerOrderRef: instruction.customerOrderRef
          };
        })
      );
      const responseData={
        currentOrders: responseOrders,
        moreAvailable: false
      }
      res.status(200).send(responseData);
    } catch (error) {
      console.error("Error processing unmatched bets:", error);
      res.status(500).send({ error: "Something went wrong!" });
    }
  },
  
  completeMatchCheckStatus : async (req, res) => {
    try {
      const { customerOrderRefs } = req.body;
      
      const bets = await Bet.find(
        { 'instructions.customerOrderRef': { $in: customerOrderRefs } },
        { instructions: 1, marketId: 1, matchVersion: 1 }
      ).lean();

      if (!bets.length) {
        return res.status(404).send({ error: "No matching bets found" });
      }

      const firstTimeBets = bets.filter(bet => bet.matchVersion === 0);
      if (firstTimeBets.length) {
        const firstTimeOrders = firstTimeBets.flatMap(bet =>
          bet.instructions.map(instruction => ({
            betId: instruction.betId,
            marketId: bet.marketId,
            selectionId: instruction.selectionId,
            handicap: instruction.handicap,
            priceSize: {
              price: instruction.limitOrder.price,
              size: instruction.limitOrder.size,
            },
            bspLiability: 0,
            side: instruction.side,
            status: 'EXECUTABLE',
            persistenceType: instruction.limitOrder.persistenceType,
            orderType: instruction.orderType,
            placedDate: instruction.placedDate,
            matchedDate: null,
            averagePriceMatched: 0,
            sizeMatched: 0,
            sizeRemaining: instruction.limitOrder.size, 
            sizeLapsed: 0,
            sizeCancelled: 0,
            sizeVoided: 0,
            regulatorCode: "MALTA LOTTERIES AND GAMBLING AUTHORITY",
            customerOrderRef: instruction.customerOrderRef
          }))
        );
  
        await Bet.updateMany(
          { _id: { $in: firstTimeBets.map(bet => bet._id) } },
          { $set: { matchVersion: 1 } }
        );
  
        return res.status(200).send({
          currentOrders: firstTimeOrders,
          moreAvailable: false
        });
      }
      
      
      const updateOperations = bets.map((bet) => {
        const updatedInstructions = bet.instructions.map((instruction) => {
          if (customerOrderRefs.includes(instruction.customerOrderRef)) {
            const totalSize = instruction.limitOrder.size;
      
            if (bet.matchVersion === 5) {
              instruction.sizeMatched = totalSize;
              instruction.sizeRemaining = 0;
              instruction.orderStatus = 'EXECUTION_COMPLETE';
            } else {
              instruction.sizeMatched = 0;
              instruction.sizeRemaining = totalSize;
              instruction.orderStatus = 'EXECUTABLE';
            }
          }
          return instruction;
        });
      
        return {
          updateOne: {
            filter: { _id: bet._id, matchVersion: bet.matchVersion },
            update: { instructions: updatedInstructions, $inc: { matchVersion: 1 } }
          }
        };
      });
      

      await Bet.bulkWrite(updateOperations);

      bets.forEach((bet) => {
        bet.instructions = bet.instructions.filter(
          (instruction) => instruction.orderStatus !== "CANCELLED"
        );
      });
      
      const responseOrders = bets.flatMap((bet) =>
        bet.instructions.map((instruction) => {
          return {
            betId: instruction.betId,
            marketId: bet.marketId,
            selectionId: instruction.selectionId,
            handicap: instruction.handicap,
            priceSize: {
              price: instruction.limitOrder.price,
              size: instruction.limitOrder.size,
            },
            bspLiability: 0,
            side: instruction.side,
            status: instruction.orderStatus,
            persistenceType: instruction.limitOrder.persistenceType,
            orderType: instruction.orderType,
            placedDate: instruction.placedDate,
            matchedDate: new Date(),
            averagePriceMatched: instruction.limitOrder.price,
            sizeMatched: +((instruction.sizeMatched)?.toFixed(2)),
            sizeRemaining: +((instruction.sizeRemaining)?.toFixed(2)),
            sizeLapsed: 0,
            sizeCancelled: 0,
            sizeVoided: 0,
            regulatorCode: "MALTA LOTTERIES AND GAMBLING AUTHORITY",
            customerOrderRef: instruction.customerOrderRef
          };
        })
      );
      const responseData={
        currentOrders: responseOrders,
        moreAvailable: false
      }
      res.status(200).send(responseData);
    } catch (error) {
      console.error("Error processing unmatched bets:", error);
      res.status(500).send({ error: "Something went wrong!" });
    }
  },

  MakeBetLapseCheckStatus : async (req, res) => {
    try {
      const { customerOrderRefs } = req.body;
  
      const bets = await Bet.find(
        { 'instructions.customerOrderRef': { $in: customerOrderRefs } },
        { instructions: 1, marketId: 1, matchVersion: 1 }
      ).lean();
  
      if (!bets.length) {
        return res.status(404).send({ error: "No matching bets found" });
      }
  
      const completelyMatchedBets = bets.filter((bet) => {
        return bet.instructions.every(
          (instruction) => instruction.sizeMatched === instruction.limitOrder.size
        );
      });
  
      if (!completelyMatchedBets.length) {
        return res.status(200).send({
          currentOrders: [],
          moreAvailable: false,
        });
      }
  
      const completeMatchOrders = completelyMatchedBets.flatMap((bet) =>
        bet.instructions.map((instruction) => ({
          betId: instruction.betId,
          marketId: bet.marketId,
          selectionId: instruction.selectionId,
          handicap: instruction.handicap,
          priceSize: {
            price: instruction.limitOrder.price,
            size: instruction.limitOrder.size,
          },
          bspLiability: 0,
          side: instruction.side,
          status: "EXECUTION_COMPLETE",
          persistenceType: instruction.limitOrder.persistenceType,
          orderType: instruction.orderType,
          placedDate: instruction.placedDate,
          matchedDate: new Date(),
          averagePriceMatched: instruction.limitOrder.price,
          sizeMatched: instruction.limitOrder.size,
          sizeRemaining: 0,
          sizeLapsed: 0,
          sizeCancelled: 0,
          sizeVoided: 0,
          regulatorCode: "MALTA LOTTERIES AND GAMBLING AUTHORITY",
          customerOrderRef: instruction.customerOrderRef,
        }))
      );
  
      await Bet.updateMany(
        { _id: { $in: completelyMatchedBets.map((bet) => bet._id) } },
        {
          $set: { "instructions.$[].orderStatus": "EXECUTION_COMPLETE" },
          $inc: { matchVersion: 1 },
        }
      );
  
      const responseData = {
        currentOrders: completeMatchOrders,
        moreAvailable: false,
      };
  
      res.status(200).send(responseData);
    } catch (error) {
      console.error("Error processing complete match status:", error);
      res.status(500).send({ error: "Something went wrong!" });
    }
  },

  deleteBet: async (req, res) => {
    try {
      const { marketId, instructions } = req.body;
  
      if (!marketId || !instructions || !Array.isArray(instructions)) {
        return res.status(400).json({ error: "Invalid request format" });
      }
  
      const instructionReports = [];
      const betIds = instructions.map(instruction => instruction.betId);
  
      const bets = await Bet.find({ marketId, "instructions.betId": { $in: betIds } }).lean();
  
      if (!bets.length) {
        return res.status(404).json({ error: "No matching bets found" });
      }
  
      const bulkOperations = [];
  
      bets.forEach(bet => {
        bet.instructions.forEach(instruction => {
          if (betIds.includes(instruction.betId)) {
            bulkOperations.push({
              updateOne: {
                filter: { _id: bet._id, "instructions.betId": instruction.betId },
                update: {
                  $set: {
                    "instructions.$.cancelled": true,
                    "instructions.$.orderStatus": "CANCELLED",
                    cancelled: true
                  }
                }
              }
            });
  
            const sizeCancelled = instruction.sizeRemaining || 0;
            instructionReports.push({
              status: "SUCCESS",
              instruction: { betId: instruction.betId },
              sizeCancelled: +sizeCancelled.toFixed(2),
              cancelledDate: new Date().toISOString()
            });
          }
        });
      });
  
      if (bulkOperations.length) {
        await Bet.bulkWrite(bulkOperations);
      }
  
      res.status(200).json({
        status: "SUCCESS",
        marketId,
        instructionReports
      });
  
    } catch (error) {
      console.error("Error cancelling bets:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
  
};