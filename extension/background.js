// ツールバーのボタンでサイドパネルを開く設定だけ。機能はすべて https://content-os.shia2n.jp/panel 側にある
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
