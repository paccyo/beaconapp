import React, { useState } from 'react';
import { View, Button, Alert, PermissionsAndroid, Platform, StyleSheet, FlatList, Text } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import firestore from '@react-native-firebase/firestore';

const App = () => {
  const manager = new BleManager();
  const [scanning, setScanning] = useState(false);
  const [beacons, setBeacons] = useState([]);

  // フィルタリングしたいmajor, minorの組み合わせ
  const filterList = [
    { major: 21, minor: 1 },
    { major: 22, minor: 1 },
    { major: 21, minor: 2 },
    { major: 9, minor: 4 },
  ];

  async function requestPermissions() {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      const allGranted = Object.values(granted).every(status => status === PermissionsAndroid.RESULTS.GRANTED);
      if (!allGranted) {
        Alert.alert('Bluetooth権限が必要です');
        return false;
      }
    } else if (Platform.OS === 'android' && Platform.Version >= 23) {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('位置情報権限が必要です');
        return false;
      }
    }
    return true;
  }

  // Base64→byte配列変換
  const base64ToBytes = (base64) => {
    const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let bytes = [];
    let buffer = 0;
    let bitsCollected = 0;

    for (let i = 0; i < base64.length; i++) {
      const c = base64.charAt(i);
      if (c === '=') break;
      const charIndex = base64chars.indexOf(c);
      if (charIndex === -1) continue;

      buffer = (buffer << 6) | charIndex;
      bitsCollected += 6;

      if (bitsCollected >= 8) {
        bitsCollected -= 8;
        bytes.push((buffer >> bitsCollected) & 0xFF);
      }
    }
    return new Uint8Array(bytes);
  };

  const parseIBeaconData = (manufacturerDataBase64) => {
    if (!manufacturerDataBase64) return null;
    const bytes = base64ToBytes(manufacturerDataBase64);

    if (bytes.length < 25) return null;
    if (bytes[2] !== 0x02 || bytes[3] !== 0x15) return null;

    const major = (bytes[20] << 8) + bytes[21];
    const minor = (bytes[22] << 8) + bytes[23];

    return { major, minor };
  };


  const handleScan = async () => {
    const permissionGranted = await requestPermissions();
    if (!permissionGranted) return;

    if (scanning) {
      Alert.alert('スキャン中です');
      return;
    }

    setScanning(true);
    setBeacons([]);
    console.log('スキャン開始');

    manager.startDeviceScan(null, null, async (error, device) => {
      if (error) {
        console.error('スキャンエラー:', error);
        manager.stopDeviceScan();
        setScanning(false);
        return;
      }

      const mData = device.manufacturerData;
      const parsed = parseIBeaconData(mData);

      if (!parsed) return;

      const { major, minor } = parsed;

      const matched = filterList.some(
        f => f.major === major && f.minor === minor
      );
      if (!matched) return;

      setBeacons(prevBeacons => {
        if (prevBeacons.find(b => b.id === device.id)) return prevBeacons;

        const newBeacon = {
          id: device.id,
          name: device.name || device.localName || '名前なし',
          major,
          minor,
          rssi: device.rssi,
          timestamp: new Date().toISOString(),
        };

        // Firestoreに送信
        firestore()
          .collection('beacons')
          .add(newBeacon)
          .then(() => console.log('Firestoreに送信成功:', newBeacon))
          .catch(e => console.error('Firestore送信エラー:', e));

        return [...prevBeacons, newBeacon];
      });
    });


    setTimeout(() => {
      manager.stopDeviceScan();
      setScanning(false);
      console.log('スキャン終了');
    }, 5000);
  };

  return (
    <View style={styles.container}>
      <Button
        title={scanning ? 'スキャン中...' : 'ビーコンをスキャンして表示'}
        onPress={handleScan}
        disabled={scanning}
      />
      <FlatList
        data={beacons}
        keyExtractor={item => item.id}
        style={{ marginTop: 20, width: '100%' }}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.title}>{item.name}</Text>
            <Text>ID: {item.id}</Text>
            <Text>major: {item.major} minor: {item.minor}</Text>
            <Text>RSSI: {item.rssi}</Text>
            <Text>検出時刻: {item.timestamp}</Text>
          </View>
        )}
        ListEmptyComponent={<Text>対象のビーコンが検出されませんでした</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  item: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#ccc' },
  title: { fontWeight: 'bold', fontSize: 16 },
});

export default App;
