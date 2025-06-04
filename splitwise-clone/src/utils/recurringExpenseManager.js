import { firebase } from '../../firebaseConfig';
import { calculateNextDueDate, LAST_DAY_OF_MONTH } from './dateUtils'; // Assuming LAST_DAY_OF_MONTH is exported if used by calculateNextDueDate
import { startOfDay, format } from 'date-fns';

/**
 * Generates expenses that are due based on recurring expense templates.
 *
 * @param {string} userUid - The UID of the current user.
 * @param {Array<object>} allUserRecurringTemplates - User's active recurring expense templates. Each template must have its Firestore ID as `id`.
 * @param {firebase.firestore.WriteBatch} firestoreBatch - Firestore WriteBatch to add operations to.
 * @returns {Promise<number>} The number of expenses generated.
 */
export const generateDueExpenses = async (userUid, allUserRecurringTemplates, firestoreBatch) => {
  if (!userUid || !allUserRecurringTemplates || !firestoreBatch) {
    console.error("generateDueExpenses: Missing required parameters.");
    return 0;
  }

  let generatedExpensesCount = 0;
  const today = startOfDay(new Date()); // Normalize current date for comparison

  for (const template of allUserRecurringTemplates) {
    if (!template.isActive || !template.id) {
      continue; // Skip inactive templates or those missing an ID
    }

    let templateNextDueDate = template.nextDueDate?.toDate ? startOfDay(template.nextDueDate.toDate()) : null;
    if (!templateNextDueDate) {
      console.warn(`Template ${template.id} is missing a valid nextDueDate. Skipping.`);
      continue;
    }

    // Safety: Ensure lastGeneratedDate is a Date object if it exists, or a very old date.
    const lastSuccessfullyGeneratedDate = template.lastGeneratedDate?.toDate ? startOfDay(template.lastGeneratedDate.toDate()) : new Date(0);

    let processingDueDate = new Date(templateNextDueDate.getTime()); // Clone for loop modification

    // Loop to generate missed or currently due occurrences
    while (processingDueDate && processingDueDate <= today) {
      // Check against template's end date
      if (template.endDate?.toDate && processingDueDate > startOfDay(template.endDate.toDate())) {
        // Recurrence period has ended for this processingDueDate. Deactivate template.
        const templateRef = firebase.firestore().collection('recurringExpenses').doc(template.id);
        firestoreBatch.update(templateRef, { isActive: false });
        console.log(`Recurring expense ${template.id} deactivated as its end date has passed.`);
        processingDueDate = null; // Stop processing this template
        break;
      }

      // Avoid re-processing if this date was already handled (e.g. function runs multiple times a day)
      // Only generate if processingDueDate is strictly after the lastSuccessfullyGeneratedDate
      if (processingDueDate <= lastSuccessfullyGeneratedDate) {
          // This date or an earlier one was already processed. Calculate next and see if that's due.
          const nextPossible = calculateNextDueDate(
            processingDueDate, // Use current processing date as base for next calculation
            template.frequency,
            { dayOfWeek: template.dayOfWeek, dayOfMonth: template.dayOfMonth, month: template.month },
            template.endDate?.toDate ? template.endDate.toDate() : null
          );
          if (nextPossible && nextPossible > processingDueDate) {
            processingDueDate = startOfDay(nextPossible); // Move to the actual next date
            continue; // Re-check while loop condition with the new processingDueDate
          } else {
            // Cannot determine a future processing date, or it's the same/earlier (error in calc or end)
            // This might also mean it's past endDate after this calculation.
            // If nextPossible is null, it's past endDate. Deactivate.
             if (!nextPossible) {
                const templateRef = firebase.firestore().collection('recurringExpenses').doc(template.id);
                firestoreBatch.update(templateRef, { isActive: false, nextDueDate: null }); // Also nullify nextDueDate
             }
            processingDueDate = null; // Stop processing this template
            break;
          }
      }

      // Construct the actual expense object
      // Ensure splitDetails are correctly copied and adapted
      const baseSplitDetails = template.splitDetails || {};
      const expenseMonthYear = format(processingDueDate, 'MMMM yyyy');
      const expenseDateSuffix = format(processingDueDate, 'yyyy-MM-dd');

      const newExpenseData = {
        ...baseSplitDetails, // This should contain paidByUid, splitType, involvedUids/memberOwes/amountPerMember, groupId (if any)
        amount: template.amount,
        description: `${template.description} (${expenseMonthYear})`, // Append month/year
        createdAt: firebase.firestore.Timestamp.fromDate(processingDueDate), // Expense date is the due date
        userId: userUid, // User who owns the template
        recurringExpenseId: template.id, // Link back to the template
        // Ensure all necessary fields from splitDetails are present e.g. groupId for group expenses
        groupId: baseSplitDetails.groupId === undefined ? null : baseSplitDetails.groupId,
      };

      // Add the new expense to the batch
      const newExpenseRef = firebase.firestore().collection('expenses').doc(); // Auto-generate ID
      firestoreBatch.set(newExpenseRef, newExpenseData);
      generatedExpensesCount++;
      console.log(`Generated expense for ${template.description} due on ${format(processingDueDate, 'yyyy-MM-dd')}`);

      // Prepare to update the template: store this processingDueDate as the last one generated for this cycle.
      const currentCycleLastGeneratedDate = new Date(processingDueDate.getTime());

      // Calculate the *next* processingDueDate for the template
      const newNextActualDueDate = calculateNextDueDate(
        processingDueDate, // Base next calculation on the date just processed
        template.frequency,
        { dayOfWeek: template.dayOfWeek, dayOfMonth: template.dayOfMonth, month: template.month },
        template.endDate?.toDate ? template.endDate.toDate() : null
      );

      if (newNextActualDueDate) {
        processingDueDate = startOfDay(newNextActualDueDate); // For the next iteration of the while loop
        // Update template for the next cycle
        const templateRef = firebase.firestore().collection('recurringExpenses').doc(template.id);
        firestoreBatch.update(templateRef, {
          nextDueDate: firebase.firestore.Timestamp.fromDate(processingDueDate),
          lastGeneratedDate: firebase.firestore.Timestamp.fromDate(currentCycleLastGeneratedDate)
        });
      } else {
        // No next due date, likely past end date. Deactivate template.
        const templateRef = firebase.firestore().collection('recurringExpenses').doc(template.id);
        firestoreBatch.update(templateRef, {
            isActive: false,
            nextDueDate: null, // Nullify nextDueDate
            lastGeneratedDate: firebase.firestore.Timestamp.fromDate(currentCycleLastGeneratedDate)
        });
        processingDueDate = null; // Stop processing this template
        break;
      }
    }
  }
  return generatedExpensesCount;
};
