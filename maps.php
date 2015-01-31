<?

header('Content-Type: application/json');

# read files in directory maps/ and return json list of maps. filter out .txt and _1, _2, _3.

echo "[";

$arr = array();

if ($handle = opendir('maps')) {
    while (false !== ($entry = readdir($handle))) {
        if (preg_match("/^(.*)?(_\d)\.txt$/", $entry, $matches)) {
            $arr[] = $matches[1];
        }
    }
}

$arr = array_unique($arr);
natcasesort($arr);

echo "\"" . implode("\",\"", $arr) . "\"";

echo "]";

?>