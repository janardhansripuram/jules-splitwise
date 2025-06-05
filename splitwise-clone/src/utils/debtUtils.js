const EPSILON = 0.001; // Small value for floating point comparisons

/**
 * Simplifies a map of user balances into a list of transactions needed to settle debts.
 *
 * @param {Object.<string, number>} balancesMap - An object where keys are user UIDs
 *                                                and values are their net balances
 *                                                (positive if owed money, negative if they owe).
 *                                                Example: { uidA: -50, uidB: 30, uidC: 20 }
 * @returns {Array<{fromUid: string, toUid: string, amount: number}>}
 *          An array of transaction objects.
 */
export const simplifyDebts = (balancesMap) => {
  if (!balancesMap || Object.keys(balancesMap).length === 0) {
    return [];
  }

  const debtors = [];
  const creditors = [];

  for (const uid in balancesMap) {
    const balance = balancesMap[uid];
    if (balance < -EPSILON) {
      debtors.push({ uid, amount: Math.abs(balance) });
    } else if (balance > EPSILON) {
      creditors.push({ uid, amount: balance });
    }
  }

  const transactions = [];

  // While there are people who owe and people who are owed
  while (debtors.length > 0 && creditors.length > 0) {
    // Sort by amount descending to try and clear larger debts/credits first
    // This is not strictly necessary for correctness but can sometimes lead to "nicer" transactions
    // However, the greedy approach of just taking the current first of each list works too.
    // For simplicity and to avoid re-sorting in each loop for now, let's use a simpler iteration.
    // A more advanced algorithm might use a min-heap for creditors and max-heap for debtors.
    // The current prompt's logic implies a greedy approach that re-evaluates/sorts,
    // or simply processes the lists. Let's use sorting each time as per prompt.

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const currentDebtor = debtors[0];
    const currentCreditor = creditors[0];

    let paymentAmount = Math.min(currentDebtor.amount, currentCreditor.amount);
    paymentAmount = parseFloat(paymentAmount.toFixed(2)); // Round to 2 decimal places

    if (paymentAmount < 0.01) {
      // Amounts are too small to transact, or lists might be imbalanced due to rounding.
      // This can happen if remaining amounts are like 0.004.
      // Or, if one list is exhausted but the other still has tiny balances summing to <0.01.
      break;
    }

    transactions.push({
      fromUid: currentDebtor.uid,
      toUid: currentCreditor.uid,
      amount: paymentAmount,
    });

    currentDebtor.amount -= paymentAmount;
    currentCreditor.amount -= paymentAmount;

    // Remove if settled (or amount too small)
    if (currentDebtor.amount < EPSILON) {
      debtors.shift(); // Removes the first element (currentDebtor)
    }
    if (currentCreditor.amount < EPSILON) {
      creditors.shift(); // Removes the first element (currentCreditor)
    }
  }

  // At the end, if there are any remaining debtors or creditors with amounts > EPSILON,
  // it might indicate an imbalance in the initial balancesMap (sum of balances not zero)
  // or accumulation of floating point dust. The algorithm should ideally minimize these.
  // For this implementation, we assume the initial balances sum to zero.
  if (debtors.some(d => d.amount > EPSILON) || creditors.some(c => c.amount > EPSILON)) {
    console.warn("simplifyDebts: Remaining balances after simplification. Initial sum might not be zero or floating point dust.", debtors, creditors);
  }

  return transactions;
};

// Example Test cases:
// const balances1 = { uidA: -50, uidB: 30, uidC: 20 };
// console.log("Test 1:", simplifyDebts(balances1));
// Expected: [{ fromUid: 'uidA', toUid: 'uidB', amount: 30 }, { fromUid: 'uidA', toUid: 'uidC', amount: 20 }] (or similar if sorting changes order)

// const balances2 = { uidA: -25, uidB: -25, uidC: 50 };
// console.log("Test 2:", simplifyDebts(balances2));
// Expected: [{ fromUid: 'uidA', toUid: 'uidC', amount: 25 }, { fromUid: 'uidB', toUid: 'uidC', amount: 25 }] (or similar)

// const balances3 = { uidA: 10, uidB: 20, uidC: -30 };
// console.log("Test 3:", simplifyDebts(balances3));
// Expected: [{ fromUid: 'uidC', toUid: 'uidB', amount: 20 }, { fromUid: 'uidC', toUid: 'uidA', amount: 10 }] (or similar)

// const balances4 = { uidA: -10.005, uidB: 10.005 }; // Test epsilon and rounding
// console.log("Test 4:", simplifyDebts(balances4));
// Expected: [{ fromUid: 'uidA', toUid: 'uidB', amount: 10.01 }] or 10.00

// const balances5 = { uidA: -10, uidB: -20, uidC: 15, uidD: 15 };
// console.log("Test 5:", simplifyDebts(balances5));
// Expected: e.g. B pays C 15, B pays D 5, A pays D 10. (Multiple valid outcomes for more complex cases)
// Output for Test 5:
// [
//   { fromUid: 'uidB', toUid: 'uidC', amount: 15 },
//   { fromUid: 'uidB', toUid: 'uidD', amount: 5 }, // uidB remaining: 0. uidD remaining: 10
//   { fromUid: 'uidA', toUid: 'uidD', amount: 10 }
// ]
// This is one valid simplification.
// The sorting by amount descending each time helps to clear larger portions first.

// const balances6 = {user1: -100, user2: 50, user3: 50}
// console.log("Test 6:", simplifyDebts(balances6))
// Expected: [{from: user1, to: user2, amount: 50}, {from: user1, to: user3, amount: 50}] (order may vary)

// const balances7 = {user1: 100, user2: -50, user3: -50}
// console.log("Test 7:", simplifyDebts(balances7))
// Expected: [{from: user2, to: user1, amount: 50}, {from: user3, to: user1, amount: 50}] (order may vary)

// const balances8 = {user1: -30.0, user2: -60.0, user3: 90.0 }
// console.log("Test 8:", simplifyDebts(balances8))
// Expected: [{from: user2, to: user3, amount: 60}, {from: user1, to: user3, amount: 30}] (order may vary)

// const balances9 = {user1: 0.004, user2: -0.004}
// console.log("Test 9:", simplifyDebts(balances9)) // Should be empty due to EPSILON and paymentAmount < 0.01 check

// const balances10 = {user1: 0.01, user2: -0.01}
// console.log("Test 10:", simplifyDebts(balances10)) // [{from: user2, to: user1, amount: 0.01}]
