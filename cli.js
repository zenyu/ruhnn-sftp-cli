#!/usr/bin/env node

const program = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const glob = require('glob');
const Sftp = require('./index');

const realPath = process.cwd();
const configStr = `
请在 package.json中指定配置 sftp字段
或者 通过 -c 选项 指定配置文件，
{
    "version": "1.0.0",
    "localPath": "本地文件路径或目录，支持glob",
    "remotePath": "服务端存储路径或目录",
    "server": {
        "host": "服务器地址",
        "port": "端口",
        "username": "用户",
        "password": "密码",
    }
}

localPath => remotePath 必须都是文件或都是目录 符合 sftp 命令行行为
`;

program
    .option('-s, --server [option]', 'sftp服务器配置', 'server')
    .option('-v, --version [option]', '版本号')
    .option('-c, --config [option]', '服务器配置文件', 'package.json')
    .option('-l, --localPath [option]', '本地文件路径')
    .option('-r, --remotePath [option]', '服务端存储路径');

program.on('--help', () => {
    console.log(configStr);
});

program.parse(process.argv);
let config, sftp, version, option, putOption, localPath, serverPath;

try {
    config = require(path.join(realPath, program.config));
    sftp = program.config === 'package.json' ? config.sftp : config;

    server = sftp[program.server];
    // sftp.version >
    version = typeof program.version === 'string' ?
        program.version : typeof sftp.version === 'string' ?
            sftp.version : path.join(realPath, 'package.json').version || '1.0.0';

    option = sftp.option;
    localPath = program.localPath || sftp.localPath;
    remotePath = program.remotePath || sftp.remotePath;
} catch (e) {
    console.error(e);
    console.error(chalk.red(configStr));
    program.help();
}

function upload(sftp) {
    return new Promise((resolve, reject) => {
        // 文件
        try {
            localPath = require.resolve(localPath);
            fs.stat(localPath, (err, stat) => {
                if (err) return reject(new Error('文件地址无效'));

                const promise = stat.isFile() ? sftp.put(localPath, remotePath) :
                    stat.isDirectory() ?
                        sftp.upload(localPath, remotePath, option) :
                        Promise.reject(new Error('文件地址无效'));

                promise.then(data => resolve(data)).catch(e => reject(e));
            });
            return;
        } catch (e) {}

        // 目录
        glob(localPath, (err, paths) => {
            if (err) return reject(err);
            sftp.upload(localPath, remotePath)
                .then(data => resolve(data))
                .catch(e => reject(e));
        });

    });
}

console.log(version);
new Sftp().connect(server)
    .then(upload)
    .then(data => {
        console.log(chalk.green('\n上传完成\n'));
        process.exit(1);
    })
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
