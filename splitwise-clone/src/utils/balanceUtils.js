/**
 * Calculates the share of a given user in a specific expense.
 * @param {object} expense The expense object.
 * @param {string} currentUserUid The UID of the current user.
 * @returns {number} The user's share of the expense.
 */
export const calculateUserShareInExpense = (expense, currentUserUid) => {
  if (!currentUserUid) return 0;

  const isUserInvolved =
    expense.involvedUids?.includes(currentUserUid) ||
    (expense.splitType === 'itemized' && expense.memberOwes && expense.memberOwes[currentUserUid] !== undefined) ||
    (expense.splitType === 'exact' && expense.memberOwes && expense.memberOwes[currentUserUid] !== undefined);

  if (!isUserInvolved) return 0;

  if (expense.splitType === 'equal') {
    return expense.amountPerMember || (expense.involvedUids?.length > 0 ? expense.amount / expense.involvedUids.length : 0);
  } else if (expense.splitType === 'exact' || expense.splitType === 'itemized') {
    // For itemized, memberOwes is the sum of their shares from different items.
    // For exact, memberOwes directly states their share.
    return expense.memberOwes?.[currentUserUid] || 0;
  }
  return 0; // Should not happen if splitType is one of the above
};

/**
 * Calculates the net balance for a user within a set of expenses and settlements.
 * @param {Array<object>} expenses Array of expense objects.
 * @param {Array<object>} settlements Array of settlement objects.
 * @param {string} currentUserUid The UID of the current user.
 * @returns {number} The net balance. Positive if owed to user, negative if user owes.
 */
export const calculateNetBalance = (expenses, settlements, currentUserUid) => {
  if (!currentUserUid) return 0;

  let netBalance = 0;

  expenses.forEach(expense => {
    const myShare = calculateUserShareInExpense(expense, currentUserUid);
    if (expense.paidByUid === currentUserUid) {
      // I paid this expense. I am owed (total amount - my share).
      netBalance += (expense.amount - myShare);
    } else {
      // Someone else paid. I owe myShare.
      netBalance -= myShare;
    }
  });

  settlements.forEach(settlement => {
    if (settlement.payerUid === currentUserUid) {
      // I paid someone in this settlement. This reduces what I'm owed or increases what I owe.
      netBalance -= settlement.amount;
    } else if (settlement.receiverUid === currentUserUid) {
      // Someone paid me in this settlement. This increases what I'm owed or reduces what I owe.
      netBalance += settlement.amount;
    }
  });

  return netBalance;
};
