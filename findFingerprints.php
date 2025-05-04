<?php
header('Content-Type: application/json');

// Database connection
$conn = new mysqli("localhost", "root", "", "learnsazam");

// Check connection
if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed: " . $conn->connect_error]));
}

// Receive POST data (JSON body)
$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !is_array($input)) {
    echo json_encode(["error" => "Invalid input"]);
    exit();
}

// Prepare a statement to find matching fingerprints
$stmt = $conn->prepare("
    SELECT s.song_id, s.song_name, f.offset_time 
    FROM song_fingerprints f
    JOIN songs s ON f.song_id = s.song_id
    WHERE f.hash_val = ?
");

if (!$stmt) {
    echo json_encode(["error" => "Prepare failed: " . $conn->error]);
    exit();
}

// Structure to hold matches
$matches = [];

// Go through each hashObj
foreach ($input as $item) {
    if (!isset($item['hash']) || !isset($item['offsetTime'])) {
        continue;
    }

    $hash = $item['hash'];
    $offsetTime = $item['offsetTime'];

    // Execute statement
    $stmt->bind_param("s", $hash);
    $stmt->execute();
    $result = $stmt->get_result();

    while ($row = $result->fetch_assoc()) {
        $song_id = $row['song_id'];
        $song_name = $row['song_name'];
        $db_offset_time = $row['offset_time'];

        $offset_difference = abs(round($db_offset_time, 2) - round($offsetTime, 2));

        if (!isset($matches[$song_id])) {
            $matches[$song_id] = [
                "song_id" => $song_id,
                "song_name" => $song_name,
                "offset_differences" => []
            ];
        }
        $matches[$song_id]['offset_differences'][] = $offset_difference;
    }
}

// Close statement and connection
$stmt->close();
$conn->close();

// Return matches
echo json_encode(array_values($matches));
?>
