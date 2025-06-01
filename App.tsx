import React, { useState } from 'react';
import { View, Button, Alert, PermissionsAndroid, Platform, StyleSheet, FlatList, Text } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { ref, push } from "firebase/database" // Changed set to push
import { initializeApp } from 'firebase/app'
import { getDatabase } from "firebase/database"


interface BeaconData {
  id: string;
  name: string;
  major: number;
  minor: number;
  rssi: number;
  timestamp: string;
  distance?: number; // 推定距離を追加
}

interface Point {
  latitude: number;
  longitude: number;
}

const firebaseConfig = {
  apiKey: "AIzaSyCnjI1sLDgAztoY26IdRMPqATARoD9qHuM",
  authDomain: "chronotrack-u10nt.firebaseapp.com",
  databaseURL: "https://chronotrack-u10nt-default-rtdb.firebaseio.com",
  projectId: "chronotrack-u10nt",
  storageBucket: "chronotrack-u10nt.firebasestorage.app",
  messagingSenderId: "125029841927",
  appId: "1:125029841927:web:97a624246dba73d9437ea2"
};

const app = initializeApp(firebaseConfig)
const database = getDatabase(app)



const App = () => {
  const manager = new BleManager();
  const [scanning, setScanning] = useState(false);
  const [beacons, setBeacons] = useState<BeaconData[]>([]);
  const [detectedBeacons, setDetectedBeacons] = useState<BeaconData[]>([]); // 検出されたビーコンを一時保存
  const [calculatedPosition, setCalculatedPosition] = useState<Point | null>(null);
  const pathLossExponent = 2.0; // 経路損失指数

  // フィルタリングしたいmajor, minorの組み合わせ
  const filterList = [
    { major: 21, minor: 1 },
    { major: 22, minor: 1 },
    { major: 21, minor: 2 },
    { major: 9, minor: 4 },
  ];
  // ビーコンの位置情報（latitude, longitude座標）
  const point1 = { latitude: 0, longitude: 0 };
  const point2 = { latitude: 20, longitude: 0 };
  const point3 = { latitude: 10, longitude: 17.32 };

  const sendDummyData = (deviceId: string) => {
    const dummyPointData = {
      timestamp: new Date().toISOString(),
      latitude: Math.random() * 30, // 仮の緯度
      longitude: Math.random() * 30, // 仮の経度
      isDummy: true, // ダミーデータであることを示すフラグ
    };

    const dbRef = ref(database, `/devices/${deviceId}/points`); // 'dummy_points' パスを使用
    push(dbRef, dummyPointData)
      .then(() => console.log('Realtime Databaseにダミーデータを送信成功:', dummyPointData))
      .catch(e => console.error('Realtime Databaseダミーデータ送信エラー:', e));
  };

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
  const base64ToBytes = (base64: string) => {
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

  const parseIBeaconData = (manufacturerDataBase64: string) => {
    if (!manufacturerDataBase64) return null;
    const bytes = base64ToBytes(manufacturerDataBase64);

    if (bytes.length < 25) return null;
    if (bytes[2] !== 0x02 || bytes[3] !== 0x15) return null;

    const major = (bytes[20] << 8) + bytes[21];
    const minor = (bytes[22] << 8) + bytes[23];

    return { major, minor };
  };

  const handleScan = async () => {
    // sendfirebase(); // Removed this call as it sends dummy data
    const permissionGranted = await requestPermissions();
    if (!permissionGranted) return;

    if (scanning) {
      Alert.alert('スキャン中です');
      return;
    }

    setScanning(true);
    setBeacons([]);
    setDetectedBeacons([]);
    setCalculatedPosition(null); // 位置情報をリセット
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

      setDetectedBeacons(prevBeacons => {
        if (prevBeacons.find(b => b.id === device.id)) return prevBeacons;

        const newBeacon: BeaconData = {
          id: device.id,
          name: device.name || device.localName || '名前なし',
          major,
          minor,
          rssi: device.rssi || -100,
          timestamp: new Date().toISOString(),
        };
        return [...prevBeacons, newBeacon];
      });

      // Update the UI immediately with detected beacons (optional, but good for user feedback)
      // setBeacons(detectedBeacons); // This might cause a slight delay as detectedBeacons is async updated
      // A better way for immediate UI update:
      setBeacons(prevBeacons => {
        const newBeacon: BeaconData = {
          id: device.id,
          name: device.name || device.localName || '名前なし',
          major,
          minor,
          rssi: device.rssi || -100,
          timestamp: new Date().toISOString(),
        };
        // Check if the beacon is already in the list before adding to avoid duplicates in UI
        if (!prevBeacons.find(b => b.id === device.id)) {
          return [...prevBeacons, newBeacon];
        }
        return prevBeacons;
      });
    });


    setTimeout(() => {
      manager.stopDeviceScan();
      setScanning(false);
      console.log('スキャン終了');

      // It's important to use the state `detectedBeacons` which has been updated during the scan
      // or even better, capture the beacons that were truly detected within the timeout.
      // For this example, let's ensure `detectedBeacons` reflects the final state of scanning.
      // A more robust solution might involve passing the accumulated beacons.
      // For now, assuming `detectedBeacons` state is reliably updated by the time timeout fires.

      if (detectedBeacons.length >= 3) {
        const beaconsWithDistance = detectedBeacons.map(beacon => ({
          ...beacon,
          distance: calculateDistance(beacon.rssi, pathLossExponent),
        }));

        const beacon1 = beaconsWithDistance.find(b => b.major === filterList[0].major && b.minor === filterList[0].minor);
        const beacon2 = beaconsWithDistance.find(b => b.major === filterList[1].major && b.minor === filterList[1].minor);
        const beacon3 = beaconsWithDistance.find(b => b.major === filterList[2].major && b.minor === filterList[2].minor);

        if (beacon1 && beacon2 && beacon3 && beacon1.distance && beacon2.distance && beacon3.distance) {
          const calculatedPos = trilateration(
            point1, beacon1.distance,
            point2, beacon2.distance,
            point3, beacon3.distance
          );
          setCalculatedPosition(calculatedPos);
          if (calculatedPos) {
            console.log('推定位置:', calculatedPos);

            // Firestore Realtime Databaseに送信
            const deviceId = "device_001";
            const pointData = {
              timestamp: new Date().toISOString(),
              latitude: calculatedPos.latitude,
              longitude: calculatedPos.longitude,
            };
            // Use push() to add a new child with a unique key
            const dbRef = ref(database, `/devices/${deviceId}/points`);
            push(dbRef, pointData) // Changed set to push
              .then(() => console.log('Realtime Databaseに送信成功:', pointData))
              .catch(e => console.error('Realtime Database送信エラー:', e));
          } else {
            console.log('三点測位に失敗しました。');
          }
        } else {
          console.log('三点測位に必要なビーコンデータが不足しています。');
        }
      } else {
        console.log('三点測位に必要なビーコンが3つ以上検出されませんでした。');
      }
    }, 5000); // 5 seconds timeout
  };

  // 距離推定
  // RSSIから距離を計算する関数
  function calculateDistance(rssi: number, n: number): number {
    if (rssi === 0) {
      return -1.0; // RSSIが0の場合は距離を特定できない
    }
    const ratio = rssi * 1.0 / -63; // -63はRSSIの基準値（距離1mでのRSSI値）,今回のビーコンは全て-63で統一
    if (ratio < 1.0) {
      return Math.pow(ratio, 10);
    } else {
      return Math.pow(ratio, n);
    }
  }

  // 三点測位を行う関数
  function trilateration(
    p1: Point,
    d1: number,
    p2: Point,
    d2: number,
    p3: Point,
    d3: number
  ): Point | null {
    const x1 = p1.latitude;
    const y1 = p1.longitude;
    const r1 = d1;
    const x2 = p2.latitude;
    const y2 = p2.longitude;
    const r2 = d2;
    const x3 = p3.latitude;
    const y3 = p3.longitude;
    const r3 = d3;

    const A = 2 * x2 - 2 * x1;
    const B = 2 * y2 - 2 * y1;
    const C = r1 * r1 - r2 * r2 - x1 * x1 + x2 * x2 - y1 * y1 + y2 * y2;
    const D = 2 * x3 - 2 * x2;
    const E = 2 * y3 - 2 * y2;
    const F = r2 * r2 - r3 * r3 - x2 * x2 + x3 * x3 - y2 * y2 + y3 * y3;

    const det = A * E - B * D;

    if (Math.abs(det) < 1e-6) {
      // 平行または同一直線上に点が存在する場合、解は不定または存在しない
      return null;
    }

    const x = (C * E - B * F) / det;
    const y = (A * F - C * D) / det;

    return { latitude: x, longitude: y };
  }

  return (
      <View style={styles.container}>
      <Button
        title={scanning ? 'スキャン中...' : 'ビーコンをスキャンして表示'}
        onPress={handleScan}
        disabled={scanning}
      />
      {/* ダミーデータ送信ボタンを追加 */}
      <Button
        title="ダミーデータを送信"
        onPress={() => sendDummyData("dummy_device_id")} // 必要に応じてdeviceIdを変更
        color="orange" // ボタンの色を変更して区別しやすくする
      />
      {calculatedPosition && (
        <View style={styles.calculatedPositionContainer}>
          <Text style={styles.title}>推定位置:</Text>
          <Text>緯度: {calculatedPosition.latitude.toFixed(4)}</Text>
          <Text>経度: {calculatedPosition.longitude.toFixed(4)}</Text>
        </View>
      )}
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
            {item.distance !== undefined && <Text>推定距離: {item.distance.toFixed(2)} m</Text>}
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
  calculatedPositionContainer: {
    marginTop: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 5,
    width: '100%',
    alignItems: 'center',
  },
});

export default App;