import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import API_URL from '../constants/api';

export default function RegisterScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'verify' | 'register'>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/send-code`, { email });
      Alert.alert('Code Sent', 'Check your email for the verification code');
      setStep('verify');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Something went wrong');
    } finally { setLoading(false); }
  };

  const verifyCode = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/verify-code`, { email, code });
      setStep('register');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Invalid code');
    } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/register`, { name, email, password });
      Alert.alert('Success', 'Account created! Please login.');
      router.push('/');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Something went wrong');
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Course Compass</Text>
      <Text style={styles.subtitle}>Register</Text>

      {step === 'email' && <>
        <TextInput style={styles.input} placeholder="Email" value={email}
          onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TouchableOpacity style={styles.button} onPress={sendCode} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send Verification Code'}</Text>
        </TouchableOpacity>
      </>}

      {step === 'verify' && <>
        <TextInput style={styles.input} placeholder="Enter 6-digit code" value={code}
          onChangeText={setCode} keyboardType="number-pad" />
        <TouchableOpacity style={styles.button} onPress={verifyCode} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify Code'}</Text>
        </TouchableOpacity>
      </>}

      {step === 'register' && <>
        <TextInput style={styles.input} placeholder="Full Name" value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Password" value={password}
          onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create Account'}</Text>
        </TouchableOpacity>
      </>}

      <TouchableOpacity onPress={() => router.push('/')}>
        <Text style={styles.link}>Already have an account? Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 20, textAlign: 'center', marginBottom: 32, color: '#555' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 16 },
  button: { backgroundColor: '#2563eb', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 16 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  link: { textAlign: 'center', color: '#2563eb' },
});