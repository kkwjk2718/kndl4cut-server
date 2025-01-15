const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const QRCode = require('qrcode');
const moment = require('moment');
const crypto = require('crypto');
const chokidar = require('chokidar');

const app = express();
const port = 3000;

// 도메인 설정
const domain = 'https://kndl4cut.toby2718.com'; // 실제 배포 도메인
const rootFolder = path.resolve('./photos');

// 관리자 비밀번호 설정
const ADMIN_PASSWORD = 'secure1234';

// 미들웨어 설정
app.use(express.static('public'));
app.use('/photos', express.static(rootFolder));
app.set('view engine', 'ejs');
app.set('views', './views');

// 활성 폴더 관리
let activeFolders = new Map(); // 해시 -> 원본 폴더 매핑

// 해시 생성 함수
function createHash(folderName) {
  return crypto.createHash('sha256').update(folderName).digest('hex').slice(0, 10); // 10자 해시
}

// 폴더 감지 이벤트 처리
const chokidarOptions = {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  depth: 1,
  ignoreInitial: false,
};
const watcher = chokidar.watch(rootFolder, chokidarOptions);

watcher
  .on('addDir', async (dirPath) => {
    const folderName = path.basename(dirPath);
    if (moment(folderName, 'YYYYMMDDHHmm', true).isValid()) {
      const hash = createHash(folderName);
      activeFolders.set(hash, folderName);

      const qrLink = `${domain}/photo/${hash}`;
      console.log(`새 폴더 감지: ${folderName}, 해시: ${hash}`);
      console.log(`QR 코드 링크: ${qrLink}`);
    }
  })
  .on('unlinkDir', (dirPath) => {
    const folderName = path.basename(dirPath);
    const hash = createHash(folderName);
    activeFolders.delete(hash);
    console.log(`폴더 삭제됨: ${folderName}`);
  });

// 메인 페이지 - 일반 사용자
app.get('/', (req, res) => {
  res.render('index'); // index.ejs 렌더링
});

// 관리자 페이지 - QR 코드, 사진, 링크 모음
app.get('/admin', async (req, res) => {
  const { password } = req.query;

  // 비밀번호 검증
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).send('<h1>접근이 거부되었습니다.</h1><p>올바른 비밀번호를 입력하세요.</p>');
  }

  const qrCodes = await Promise.all(
    Array.from(activeFolders.entries()).map(async ([hash, folder]) => {
      const qrLink = `${domain}/photo/${hash}`;
      const photoPath = `/photos/${folder}/result.png`;

      return {
        hash,
        qrLink,
        photoUrl: photoPath,
        qrCode: await QRCode.toDataURL(qrLink),
        timestamp: moment(folder, 'YYYYMMDDHHmm').format('YYYY-MM-DD HH:mm'),
      };
    })
  );

  res.render('admin', { qrCodes });
});

// 사진 보기 라우트
app.get('/photo/:hash', async (req, res) => {
  const { hash } = req.params;
  const folderName = activeFolders.get(hash);

  if (!folderName) {
    return res.status(404).send('사진을 찾을 수 없습니다.');
  }

  const photoPath = path.join(rootFolder, folderName, 'result.png');
  if (await fs.pathExists(photoPath)) {
    const timestamp = moment(folderName, 'YYYYMMDDHHmm').format('YYYY-MM-DD HH:mm');
    const photoUrl = `${domain}/photos/${folderName}/result.png`;

    res.render('photo', { timestamp, photoUrl });
  } else {
    res.status(404).send('사진을 찾을 수 없습니다.');
  }
});

// 서버 실행
app.listen(port, () => {
  console.log(`서버가 ${domain} 에서 실행 중입니다.`);
});
