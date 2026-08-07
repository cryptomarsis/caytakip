@echo off
title Cay Ureticisi V2 - EXE Olusturucu
python -m pip install --upgrade pip
python -m pip install pyinstaller
python -m PyInstaller --onefile --windowed --name CayUreticisiV2 cay_uretici_v2.py
echo.
echo =========================================
echo EXE dist klasorunde olusturuldu.
echo CayUreticisiV2.exe dosyasini kullanabilirsiniz.
echo =========================================
pause
