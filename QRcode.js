import {
    close_api,
    delay,
    send,
    startService
} from "./utils/utils.js";
import fs from 'fs';
import path from 'path';
import {
    execSync
} from 'child_process';

async function qrcode() {
    let api = startService()
    await delay(2000)
    let qrcode = ""
    let src = ""
    const srcDir = "./src"
    try {
        if (!fs.existsSync(srcDir)) {
            fs.mkdirSync(srcDir, {
                recursive: true
            });
        }
        let result = await send(`/login/qr/key`, "GET", {})
        if (result.status === 1) {
            qrcode = result.data.qrcode
            src = srcDir + "/" + qrcode + ".png"
            const img_base64 = result.data.qrcode_img;
            if (img_base64) {
                const base64Data = img_base64.replace(/^data:image\/\w+;base64,/, '');
                execSync('git config --global user.email "github-actions[bot]@users.noreply.github.com"');
                execSync('git config --global user.name "github-actions[bot]"');
                execSync(`sed -i 's|<img src="[^"]*" alt="登录二维码" width="200"\\/>|<img src="${src}" alt="登录二维码" width="200"\\/>|' README.md`);
                execSync(`sed -i 's|<sub>状态:.*<\\/sub>|<sub>状态: 等待扫码登录<\\/sub>|' README.md`);
                const buffer = Buffer.from(base64Data, 'base64');
                fs.writeFileSync(src, buffer);
                if (fs.existsSync(src)) {
                    execSync('git add -A');
                    try {
                        execSync('git commit -m "chore: 添加二维码 [skip ci]"');
                        execSync('git push --quiet --force-with-lease');
                        console.log('✅ 已更新二维码, 请在仓库主页扫描二维码并确定登录');
                    } catch (commitError) {}
                }
            }
        } else {
            console.log("响应内容")
            console.dir(result, {
                depth: null
            })
            throw new Error("请求失败！请检查")
        }
        if (qrcode == "") {
            throw new Error("二维码异常")
        }
        // 登录
        let logined = false
        for (let i = 0; i < 50; i++) {
            const timestrap = Date.now();
            const res = await send(`/login/qr/check?key=${qrcode}&timestrap=${timestrap}`, "GET", {})
            const status = res?.data?.status
            switch (status) {
                case 0:
                    logined = true
                    console.log("二维码已过期")
                    break
                case 1:
                    // console.log("未扫描二维码")
                    break
                case 2:
                    // console.log("二维码未确认，请点击确认登录")
                    break
                case 4:
                    logined = true
                    console.log("登录成功！")
                    try {
                        execSync(`gh secret set TOKEN -b"${res.data.token}" --repo ${process.env.GITHUB_REPOSITORY}`);
                        execSync(`gh secret set USERID -b"${res.data.userid}" --repo ${process.env.GITHUB_REPOSITORY}`);
                        console.log("secret <TOKEN> <USERID> 更改成功")
                        const result = await getBeijingDateTime();
                        execSync(`sed -i 's/|\\*\\*登录\\*\\*|.*|/|\\*\\*登录\\*\\*|\\*\\*${result.currentBeijing}\\*\\*|/' README.md`);
                        execSync(`sed -i 's/|\\*\\*预过期\\*\\*|.*|/|\\*\\*预过期\\*\\*|\\*\\*${result.twoMonthsLater}\\*\\*|/' README.md`);
                    } catch (error) {
                        console.log("token:")
                        console.log(res.data.token)
                        console.log("userid:")
                        console.log(res.data.userid)
                    }
                    break;
                default:
                    console.log("请求出错。")
                    console.dir(res, {
                        depth: null
                    })
            }
            if (logined) {
                break
            }
            await delay(2000)
        }
    } finally {
        close_api(api)
    }
    if (api.killed) {
        await deleteOldPNGFiles(srcDir, 1)
        process.exit(0)
    }
}

async function getBeijingDateTime() {
    const getBeijingTime = () => {
        const now = new Date();
        return new Date(now.getTime() + (8 * 60 * 60 * 1000));
    };
    const current = getBeijingTime();
    const currentStr = `${current.getUTCFullYear()}-${(current.getUTCMonth() + 1).toString().padStart(2, '0')}-${current.getUTCDate().toString().padStart(2, '0')}`;
    const future = new Date(current);
    future.setUTCMonth(future.getUTCMonth() + 2);
    const futureStr = `${future.getUTCFullYear()}-${(future.getUTCMonth() + 1).toString().padStart(2, '0')}-${future.getUTCDate().toString().padStart(2, '0')}`;
    return {
        currentBeijing: currentStr,
        twoMonthsLater: futureStr,
        currentDate: current,
        futureDate: future
    };
}

async function deleteOldPNGFiles(folderPath, keepCount = 5) {
    try {
        if (!fs.existsSync(folderPath)) {
            return [];
        }
        const files = fs.readdirSync(folderPath)
            .filter(file => path.extname(file).toLowerCase() === '.png')
            .map(file => {
                const filePath = path.join(folderPath, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    path: filePath,
                    mtime: stats.mtimeMs,
                    ctime: stats.ctimeMs,
                    size: stats.size
                };
            });
        files.sort((a, b) => b.mtime - a.mtime);
        const deletedFiles = [];
        for (let i = keepCount; i < files.length; i++) {
            try {
                fs.unlinkSync(files[i].path);
                deletedFiles.push(files[i].name);
            } catch (error) {}
        }
        try {
            execSync('git add -A');
            execSync('git commit -m "chore: 删除旧二维码图片 [skip ci]"');
            execSync('git push --quiet --force-with-lease');
            console.log('删除旧二维码');
        } catch (commitError) {}
        return deletedFiles;
    } catch (error) {
        return [];
    }
}

qrcode()