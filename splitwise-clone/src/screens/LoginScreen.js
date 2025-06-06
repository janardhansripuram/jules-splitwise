import React, { useState } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { firebase } from '../../firebaseConfig';
import { Button as PaperButton, TextInput as PaperTextInput, Text as PaperText, useTheme, ActivityIndicator as PaperActivityIndicator } from 'react-native-paper';

function LoginScreen({ navigation }) {
  const theme = useTheme(); // Access the theme
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Input Error", "Please enter both email and password.");
      return;
    }
    setLoading(true);
    try {
      await firebase.auth().signInWithEmailAndPassword(email.trim(), password);
      // Navigation is handled by onAuthStateChanged in App.js
    } catch (error) {
      Alert.alert("Login Failed", error.message);
      // console.error("Login error: ", error); // Keep for debugging if needed
    }
    setLoading(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <PaperText variant="headlineLarge" style={[styles.title, { color: theme.colors.primary }]}>Welcome Back!</PaperText>
      <PaperTextInput
        label="Email Address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        textContentType="emailAddress"
        disabled={loading}
        style={styles.input}
        mode="outlined"
      />
      <PaperTextInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        disabled={loading}
        style={styles.input}
        mode="outlined"
      />
      {loading ? (
        <PaperActivityIndicator animating={true} color={theme.colors.primary} size="large" style={styles.loader} />
      ) : (
        <PaperButton
          mode="contained"
          onPress={handleLogin}
          disabled={loading}
          style={styles.button}
          labelStyle={styles.buttonLabel}
        >
          Login
        </PaperButton>
      )}
      <TouchableOpacity onPress={() => navigation.navigate('SignUp')} disabled={loading} style={styles.switchButton}>
        <PaperText variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Don't have an account? <PaperText variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>Sign Up</PaperText>
        </PaperText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 25,
  },
  title: {
    textAlign: 'center',
    marginBottom: 35,
  },
  input: {
    marginBottom: 15,
  },
  button: {
    marginTop: 10,
    paddingVertical: 8, // Add some padding to the button
  },
  buttonLabel: {
    fontSize: 16, // Make button text slightly larger if desired
  },
  loader: {
    marginTop: 20,
    marginBottom: 20,
  },
  switchButton: {
    marginTop: 30,
    alignItems: 'center',
  },
  // Removed text styles that are now handled by PaperText variants or theme
});

export default LoginScreen;
