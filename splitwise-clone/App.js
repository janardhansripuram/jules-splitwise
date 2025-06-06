import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { appTheme } from './src/theme/appTheme'; // Import your custom appTheme
import RootNavigator from './src/navigation/AppNavigator';
import { firebase } from './firebaseConfig';
import AuthLoadingScreen from './src/screens/AuthLoadingScreen';

export default function App() {
  const [userToken, setUserToken] = useState(undefined);

  useEffect(() => {
    const unsubscribe = firebase.auth().onAuthStateChanged(user => {
      if (user) {
        setUserToken(user);
      } else {
        setUserToken(null);
      }
    });
    return () => unsubscribe();
  }, []);

  if (userToken === undefined) {
    return <AuthLoadingScreen />;
  }

  return (
    <PaperProvider theme={appTheme}>
      <NavigationContainer>
        <RootNavigator userToken={userToken} />
      </NavigationContainer>
    </PaperProvider>
  );
}
