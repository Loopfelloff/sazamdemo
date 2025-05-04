<?php
$servername = "localhost";
$username = "root";
$password = "";
$dbname = "learnsazam";

$conn = new mysqli($servername, $username, $password, $dbname);

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Expect JSON input
$data = json_decode(file_get_contents('php://input'), true);

$song_name = $data['song_name'];
$hashes = $data['hashes']; // array of objects {t2, f2, a2} 
$stmt = $conn->prepare("INSERT INTO songs (song_name) VALUES (?)");
$stmt->bind_param("s", $song_name);
$stmt->execute();
$song_id = $stmt->insert_id;
$stmt->close();

$stmt = $conn->prepare("INSERT INTO song_fingerprints (song_id, hash_val, offset_time) VALUES (?, ?, ?)");

foreach ($hashes as $hash) {
    $hash_val = $hash['hash'];
    $offset_time = $hash['offsetTime'];
    $stmt->bind_param("isi", $song_id, $hash_val, $offset_time);
    $stmt->execute();
}

$stmt->close();
$conn->close();

echo json_encode(["status" => "success"]);
?>
