import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import RootNavigator from './src/navigation/AppNavigator'; // Renamed import
import { firebase } from './firebaseConfig'; // Ensure firebase is imported for auth
import AuthLoadingScreen from './src/screens/AuthLoadingScreen'; // Direct import for initial state

export default function App() {
  // undefined: checking, null: no user, object: user exists
  const [userToken, setUserToken] = useState(undefined);

  useEffect(() => {
    const unsubscribe = firebase.auth().onAuthStateChanged(user => {
      if (user) {
        // User is signed in.
        setUserToken(user); // Or user.uid, or a boolean true, depending on what RootNavigator expects
      } else {
        // User is signed out.
        setUserToken(null);
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // Show AuthLoadingScreen separately before NavigationContainer if still checking
  // This avoids navigator rendering before auth state is known, preventing flickers.
  if (userToken === undefined) {
    return <AuthLoadingScreen />;
  }

  return (
    <NavigationContainer>
      {/* Pass userToken to RootNavigator; it will decide which stack to show */}
      <RootNavigator userToken={userToken} />
    </NavigationContainer>
  );
}
