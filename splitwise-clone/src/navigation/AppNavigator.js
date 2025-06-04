import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
// Removed Text, View, Button imports as HomeScreen is moved
import AddExpenseScreen from '../screens/AddExpenseScreen';
import DashboardScreen from '../screens/DashboardScreen'; // Import DashboardScreen

const Stack = createStackNavigator();

function AppNavigator() {
  return (
    <Stack.Navigator initialRouteName="Dashboard">
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <Stack.Screen
        name="AddExpense"
        component={AddExpenseScreen}
        options={{ title: 'Add Expense' }}
      />
    </Stack.Navigator>
  );
}

export default AppNavigator;
