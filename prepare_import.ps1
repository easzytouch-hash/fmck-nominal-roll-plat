# ============================================================
# FMCK Nominal Roll - Data Preparation Script (PowerShell port)
# Mirrors prepare_import.py logic, reading directly from the
# corrected norminal-roll-fmck-2026.xlsx (Sheet2 = sheet1.xml)
# ============================================================

$ErrorActionPreference = "Stop"
$base = "C:\Users\user\Documents\desktop\Halimafactor 2025\FMC KUMO STAFF DATABASE INFO\Internal Memo\Nominal\fmck-nominal-roll-mgt"
$xlsx = Join-Path $base "norminal-roll-fmck-2026.xlsx"
$outCsv = Join-Path $base "fmck_nominal_roll_import_ready.csv"
$outReport = Join-Path $base "fmck_import_report.txt"

# ── Extract sheet + sharedStrings ───────────────────────────
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($xlsx)
$sheetEntry = $zip.GetEntry("xl/worksheets/sheet1.xml")   # Sheet2 -> sheet1.xml
$ssEntry    = $zip.GetEntry("xl/sharedStrings.xml")
$sr1 = New-Object System.IO.StreamReader($sheetEntry.Open()); $sheetXml = $sr1.ReadToEnd(); $sr1.Close()
$sr2 = New-Object System.IO.StreamReader($ssEntry.Open());    $ssXml    = $sr2.ReadToEnd(); $sr2.Close()
$zip.Dispose()

[xml]$ss = $ssXml
[xml]$sheet = $sheetXml

$strings = New-Object System.Collections.Generic.List[string]
foreach($si in $ss.sst.si){
  if($si.r -ne $null){ $strings.Add((($si.r | ForEach-Object { $_.t }) -join '')) }
  elseif ($si.t -is [string]) { $strings.Add($si.t) }
  else { $strings.Add($si.t.InnerText) }
}

$rows = $sheet.worksheet.sheetData.row
function GetCellRaw($c){ return @{ t = $c.t; v = $c.v } }
function GetCellVal($c){
  if($c.v -eq $null){ return "" }
  if($c.t -eq "s"){ return $strings[[int]$c.v] }
  return $c.v
}
function ColLetter($r){ ($r -replace '[0-9]','') }

# ── Excel serial date -> ISO ────────────────────────────────
$excelEpoch = Get-Date "1899-12-30"
function SerialToIso($serial){
  $d = $excelEpoch.AddDays([double]$serial)
  return $d.ToString("yyyy-MM-dd")
}

# ── COLUMN MAP (header -> app field) ────────────────────────
$COLUMN_MAP = @{
  "FIRST NAME"               = "FirstName"
  "SURNAME"                  = "Surname"
  "OTHER"                    = "OtherName"
  "GENDER"                   = "Gender"
  "PERMANENT ADDRESS"        = "PermanentAddress"
  "DOB"                      = "DateOfBirth"
  "STATE"                    = "StateOfOrigin"
  "LGC"                      = "LGA"
  "GEOPOLITICAL ZONE"        = "GeopoliticalZone"
  "QUALIFICATION"            = "Qualification"
  "FOLDER NO./FILE_NO"       = "FolderNumber"
  "IPPIS_NUMBER"             = "IPPISNo"
  "PREVIOUS CONMESS/CONHESS" = "PreviousSalaryGrade"
  "ABSORBED CONMESS/CONHESS" = "AbsorbedSalaryGrade"
  "RANK"                     = "Rank"
  "1ST APPT."                = "DateOfFirstAppt"
  "CORNFIRM OF APPT."        = "DateOfConfirmation"
  "PRESENT APPT."            = "DateOfPresentAppt"
  "PHONE NUMBER"             = "Phone"
  "E-MAIL"                   = "Email"
  "LOCATION"                 = "Location"
  "REMARK"                   = "Remarks"
}

$OUTPUT_COLUMNS = @(
  "FolderNumber","IPPISNo","Surname","FirstName","OtherName",
  "Gender","DateOfBirth","PermanentAddress","StateOfOrigin",
  "LGA","GeopoliticalZone","Qualification",
  "PreviousSalaryGrade","AbsorbedSalaryGrade","Rank",
  "Department","Unit",
  "DateOfFirstAppt","DateOfConfirmation","DateOfPresentAppt",
  "Phone","Email","Location","Status","Remarks"
)

# ── RANK FIXES / REVIEW (subset matching prepare_import.py) ─
$RANK_FIXES = @{
  "Admin OFFICER II" = "ADMIN OFFICER II"
  "CHIEF Med LAB sc" = "CHIEF MED LAB SC"; "DENTAL SURGERY Technician" = "DENTAL SURGERY TECHNICIAN"
  "MEDICAL LABORATORY Scientist" = "MEDICAL LABORATORY SCIENTIST"
  "ADMIN OFFICER 11" = "ADMIN OFFICER II"; "SCIENTIFIC OFFICE I" = "SCIENTIFIC OFFICER I"
  "SCIENTIFIC OFFICE II" = "SCIENTIFIC OFFICER II"; "SCIENTIFIC OFFICERS II" = "SCIENTIFIC OFFICER II"
  "SCIENTIFIC OFFICERII" = "SCIENTIFIC OFFICER II"; "COMMUNITY HEALTHTECHNICIAN" = "COMMUNITY HEALTH TECHNICIAN"
  "ACCOUNTANT 1" = "ACCOUNTANT I"; "MED. LAB. TECH." = "MEDICAL LABORATORY TECHNICIAN"
  "PHARMACY TECH" = "PHARMACY TECHNICIAN"; "PRICIPAL NURSING OFFICER" = "PRINCIPAL NURSING OFFICER"
  "PRIN NURSING OFFICER" = "PRINCIPAL NURSING OFFICER"; "PRIN PHYSOTHERAPIST" = "PRINCIPAL PHYSIOTHERAPIST"
  "PRIN MEDICAL LABORATORY TECHNICIAN" = "PRINCIPAL MEDICAL LABORATORY TECHNICIAN"
  "PRIN. HEALTH INFORMATION MANAGEMENT TECHNICIAN" = "PRINCIPAL HEALTH INFORMATION MANAGEMENT TECHNICIAN"
  "ASSISTANT EXECUTIVE OFFICE ADMIN" = "ASSISTANT EXECUTIVE OFFICER ADMIN"
  "ASSIT. EXECUTIVE OFFICER ADMIN" = "ASSISTANT EXECUTIVE OFFICER ADMIN"
  "ASST EXECUTIVE OFFICER ADMIN" = "ASSISTANT EXECUTIVE OFFICER ADMIN"
  "ASST CHIEF DENTAL OFFICER" = "ASSISTANT CHIEF DENTAL OFFICER"
  "ASST CHIEF RADIOGRAPHER" = "ASSISTANT CHIEF RADIOGRAPHER"
  "ASST.CHIEF MED. LAB SC" = "ASSISTANT CHIEF MEDICAL LABORATORY SCIENTIST"
  "ASSISTANT EXECUTIVE OFFICER (GEN DUTY)" = "ASSISTANT EXECUTIVE OFFICER GENERAL DUTIES"
  "ASSISTANT EXECUTIVE OFFICER GD" = "ASSISTANT EXECUTIVE OFFICER GENERAL DUTIES"
  "ASSISTANT EXECUTIVE OFFICER GENERAL DUTY" = "ASSISTANT EXECUTIVE OFFICER GENERAL DUTIES"
  "ASSISTANT EXECUTIVE OFFICER GEN DUTY" = "ASSISTANT EXECUTIVE OFFICER GENERAL DUTIES"
  "HIGHER ASSIST. EXECUTIVE OFFICER" = "HIGHER ASSISTANT EXECUTIVE OFFICER"
  "HIGHER EXECUTIVE OFFCER ACCOUNTS" = "HIGHER EXECUTIVE OFFICER ACCOUNTS"
  "HIGHER EXECUTIVE OFFICERACCOUNTS" = "HIGHER EXECUTIVE OFFICER ACCOUNTS"
  "HIGHER EXECUTIVE OFFICER ACCOUNT" = "HIGHER EXECUTIVE OFFICER ACCOUNTS"
  "HIGHER INFORMATION MANAGEMENT OFFICER" = "HIGHER HEALTH INFORMATION MANAGEMENT OFFICER"
  "HIGHER INFORMATION MANAGEMENT TECHNICIAN" = "HIGHER HEALTH INFORMATION MANAGEMENT TECHNICIAN"
  "HIGHER XRAY TECHNICIAN" = "HIGHER X-RAY TECHNICIAN"; "X-RAY TECHNICIAN" = "XRAY TECHNICIAN"
  "SCIENCE LAB TECH." = "SCIENCE LABORATORY TECHNICIAN"; "SCIENTIFIC OFFICER" = "SCIENTIFIC OFFICER II"
  "COMMUNITY HEALTH OFFICER II" = "COMMUNITY HEALTH OFFICER"; "ENVIRONMENTAL HEALTH TECH" = "ENVIRONMENTAL HEALTH TECHNICIAN"
  "ENVIRONMENTAL OFFICER I" = "ENVIRONMENTAL OFFICER"; "STAT OFFICER II" = "STATISTICAL OFFICER II"
  "NURSING OFFICER" = "NURSING OFFICER II"; "NURSE" = "STAFF NURSE"; "COMMUNITY NURSE" = "STAFF NURSE"
  "SEN. MEDICAL LABORATORY TECHNOLOGIST" = "SENIOR MEDICAL LABORATORY TECHNOLOGIST"
  "CATERING OFFICER ASSISTANT" = "ASSISTANT CATERING OFFICER"; "CATERING OFFICER I" = "CATERING OFFICER"
  "PLANT OPERATION" = "PLANT OPERATOR"; "CRAFTMAN CARPENTRY" = "CRAFTSMAN CARPENTRY"
  "CRAFTMAN PLANT OPERATOR" = "CRAFTSMAN PLANT OPERATOR"; "DRIVER MOTOR MECHANIC I" = "MOTOR DRIVER MECHANIC I"
  "HEALTH INFORMATION MANAGEMENT" = "HEALTH INFORMATION MANAGEMENT OFFICER"
  "ASST. EXECUTIVE OFFICER ADMIN" = "ASSISTANT EXECUTIVE OFFICER ADMIN"
  "ASSISTANT EXECUTIVE OFFICER ACCOUNTS" = "ASSISTANT EXECUTIVE OFFICER ACCOUNT"
  "POPULATION PROGRAM OFFICER" = "POPULATION PROGRAMME OFFICER"; "POPULATION PROGRAM OFFICER I" = "POPULATION PROGRAMME OFFICER I"
  "POPULATION OFFICER II" = "POPULATION PROGRAMME OFFICER II"; "PLANNING OFFICER" = "PLANNING OFFICER II"
  "PLANNING OFFICER I" = "PLANNING OFFICER"; "MEDICAL SOCIAL WORKER" = "SOCIAL WELFARE OFFICER"
}
$RANK_REVIEW = @{
  "B. TECH SLT" = "Cadre unclear - verify correct designation"
  "Building Technologist" = "Verify: intended as 'TECHNICAL OFFICER BUILDING'?"
  "HEALTH RECORD TECHNICIAN" = "Verify: same as 'HEALTH INFORMATION MANAGEMENT TECHNICIAN'?"
  "CIVIL ENGINEER" = "Verify: same as 'CIVIL ENGINEER I'?"
  "PSYCHOLOGIST" = "Verify: same as 'PSYCHOLOGIST I'?"
  "DENTAL THERAPIST TECHNOLOGIST" = "Verify cadre distinction from DENTAL SURGERY TECHNOLOGIST"
}

function Clean($v){
  if($v -eq $null){ return "" }
  $s = ([string]$v).Trim()
  if($s -match '^(NULL|NAN|NONE|N/A)$'){ return "" }
  return $s
}

function ParseDate($cell){
  if($cell -eq $null){ return "" }
  $raw = Clean (GetCellVal $cell)
  if(-not $raw){ return "" }
  if($cell.t -ne "s" -and $raw -match '^\d+(\.\d+)?$' -and [double]$raw -gt 20000 -and [double]$raw -lt 60000){
    return SerialToIso $raw
  }
  if($raw -match '^(\d{4})-(\d{2})-(\d{2})'){ return $raw.Substring(0,10) }
  if($raw -match '^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$'){
    $d=[int]$matches[1]; $m=[int]$matches[2]; $y=[int]$matches[3]
    if($y -lt 100){ $y += 2000 }
    try { return (Get-Date -Year $y -Month $m -Day $d).ToString("yyyy-MM-dd") } catch { return $raw }
  }
  return $raw
}

# ── Header map: column letter -> app field ──────────────────
$hrow = $rows | Where-Object { $_.r -eq "1" }
$colField = @{}
foreach($c in $hrow.c){
  $h = (GetCellVal $c).Trim()
  if($COLUMN_MAP.ContainsKey($h)){ $colField[(ColLetter $c.r)] = $COLUMN_MAP[$h] }
}

# ── Process rows 2..802 ──────────────────────────────────────
$records = @()
$skippedBlank = 0
$skippedGarbage = @()
$rankFixed = @{}
$rankReview = @{}
$missingFolder = @()
$missingIppis = @()
$deptBlank = 0

for($i=2; $i -le 802; $i++){
  $row = $rows | Where-Object { $_.r -eq "$i" }
  $cells = @{}
  if($row -ne $null){ foreach($c in $row.c){ $cells[(ColLetter $c.r)] = $c } }

  $surname = ""; $firstname = ""
  foreach($col in $colField.Keys){
    if($colField[$col] -eq "Surname" -and $cells.ContainsKey($col)){ $surname = Clean (GetCellVal $cells[$col]) }
    if($colField[$col] -eq "FirstName" -and $cells.ContainsKey($col)){ $firstname = Clean (GetCellVal $cells[$col]) }
  }
  if(-not $surname -and -not $firstname){ $skippedBlank++; continue }

  # IPPIS garbage check (date-like serial in IPPIS column)
  $ippisCol = ($colField.GetEnumerator() | Where-Object { $_.Value -eq "IPPISNo" }).Key
  $ippisCell = $cells[$ippisCol]
  $ippisRaw = if($ippisCell){ Clean (GetCellVal $ippisCell) } else { "" }
  if($ippisCell -and $ippisCell.t -ne "s" -and $ippisRaw -match '^\d+(\.\d+)?$' -and [double]$ippisRaw -gt 20000 -and [double]$ippisRaw -lt 60000){
    $skippedGarbage += "Row $($i-1): $surname $firstname | IPPIS field contains a date value: $(SerialToIso $ippisRaw)"
    continue
  }

  $rec = @{}
  foreach($col in $OUTPUT_COLUMNS){ $rec[$col] = "" }

  foreach($col in $colField.Keys){
    $field = $colField[$col]
    if(-not $cells.ContainsKey($col)){ continue }
    if($field -in @("DateOfBirth","DateOfFirstAppt","DateOfConfirmation","DateOfPresentAppt")){
      $rec[$field] = ParseDate $cells[$col]
    } else {
      $rec[$field] = Clean (GetCellVal $cells[$col])
    }
  }

  $rec["Department"] = ""; $rec["Unit"] = ""; $rec["Status"] = "Active"
  if(-not $rec["Location"]){ $rec["Location"] = "KUMO" }

  if($rec["IPPISNo"]){
    if($rec["IPPISNo"] -match '^\d+(\.\d+)?$'){ $rec["IPPISNo"] = [string][int64][double]$rec["IPPISNo"] }
    $rec["IPPISNo"] = $rec["IPPISNo"] -replace ',',''
  }

  $origRank = $rec["Rank"]
  if($RANK_FIXES.ContainsKey($origRank)){ $rec["Rank"] = $RANK_FIXES[$origRank]; $rankFixed[$origRank] = $rec["Rank"] }
  if($RANK_REVIEW.ContainsKey($origRank)){
    if(-not $rankReview.ContainsKey($origRank)){ $rankReview[$origRank] = @() }
    $rankReview[$origRank] += "Row $($i-1): $surname $firstname [$($rec['FolderNumber'])]"
  }

  if(-not $rec["FolderNumber"]){ $missingFolder += "Row $($i-1): $surname $firstname | IPPIS: $($rec['IPPISNo']) | Rank: $($rec['Rank'])" }
  if(-not $rec["IPPISNo"]){ $missingIppis += "Row $($i-1): $surname $firstname | Folder: $($rec['FolderNumber']) | Rank: $($rec['Rank'])" }
  if(-not $rec["Department"]){ $deptBlank++ }

  $records += [PSCustomObject]$rec
}

# ── Write CSV ────────────────────────────────────────────────
$records | Select-Object $OUTPUT_COLUMNS | Export-Csv -Path $outCsv -NoTypeInformation -Encoding UTF8

# ── Write Report ─────────────────────────────────────────────
$lines = @()
$lines += ("=" * 70)
$lines += "FMCK NOMINAL ROLL - DATA PREPARATION REPORT"
$lines += "Generated: $(Get-Date -Format 'dd MMMM yyyy, HH:mm')"
$lines += ("=" * 70)
$lines += ""
$lines += "SUMMARY"
$lines += ("-" * 40)
$lines += "  Source rows (including header): 802"
$lines += "  Blank rows skipped:             $skippedBlank"
$lines += "  Garbage rows skipped:           $($skippedGarbage.Count)"
$lines += "  Records exported to CSV:        $($records.Count)"
$lines += "  Records missing Folder No.:     $($missingFolder.Count)"
$lines += "  Records missing IPPIS No.:      $($missingIppis.Count)"
$lines += "  Records with blank Department:  $deptBlank  <- assign in-app after import"
$lines += "  RANK variants auto-corrected:   $($rankFixed.Keys.Count)"
$lines += "  RANK values flagged for review: $($rankReview.Keys.Count)"
$lines += ""
if($skippedGarbage.Count -gt 0){
  $lines += "GARBAGE ROWS SKIPPED (not imported)"
  $lines += ("-" * 40)
  $lines += $skippedGarbage
  $lines += ""
}
if($missingFolder.Count -gt 0){
  $lines += "RECORDS WITH NO FOLDER NUMBER"
  $lines += ("-" * 40)
  $lines += "  These records were imported. Assign folder numbers in-app."
  $lines += $missingFolder
  $lines += ""
}
if($missingIppis.Count -gt 0){
  $lines += "RECORDS WITH NO IPPIS NUMBER"
  $lines += ("-" * 40)
  $lines += "  These records were imported. Verify IPPIS with IPPIS portal."
  $lines += $missingIppis
  $lines += ""
}
if($rankFixed.Keys.Count -gt 0){
  $lines += "RANK VARIANTS AUTO-CORRECTED"
  $lines += ("-" * 40)
  foreach($k in ($rankFixed.Keys | Sort-Object)){ $lines += "  '$k'  ->  '$($rankFixed[$k])'" }
  $lines += ""
}
if($rankReview.Keys.Count -gt 0){
  $lines += "RANK VALUES FLAGGED FOR MANUAL REVIEW (imported as-is)"
  $lines += ("-" * 40)
  foreach($k in $rankReview.Keys){
    $lines += "  '$k' - $($RANK_REVIEW[$k])"
    foreach($e in $rankReview[$k]){ $lines += "    $e" }
  }
  $lines += ""
}
$lines += "DEPARTMENT/UNIT - ACTION REQUIRED"
$lines += ("-" * 40)
$lines += "  The source spreadsheet does not contain a Department or Unit column."
$lines += "  All $deptBlank records have been imported with blank Department/Unit."
$lines += "  After import, use the Nominal Roll tab to assign each staff member"
$lines += "  to their correct department and unit."
$lines += ""
$lines += ("=" * 70)
$lines += "Output file: fmck_nominal_roll_import_ready.csv"
$lines += "Ready to import into FMCK Nominal Roll Management System."
$lines += ("=" * 70)

$lines | Out-File -FilePath $outReport -Encoding utf8

"Records exported: $($records.Count)"
"Blank skipped: $skippedBlank"
"Garbage skipped: $($skippedGarbage.Count)"
"Missing folder: $($missingFolder.Count)"
"Missing IPPIS: $($missingIppis.Count)"
