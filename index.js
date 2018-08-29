const path = require('path');
const chalk = require('chalk');
const glob = require('glob');
const fs = require('fs');
const Client = require('ssh2').Client;


/**
 * @param wait 重复执行前时间间隔 毫秒为单位
 * @param time -1 无限重复； 0 执行一次； >0 重复>0次；
 * @param fn 需要重复执行的函数
 * @param callback 执行完最后一次的回调
 * @returns {Function}
 */
function retry({wait = 0, time = -1}, fn, callback) {
    wait = typeof wait === 'number' && wait >= 0 ? wait : 0;
    time = typeof time === 'number' && time >= -1 ? time : 1;

    return function(...arg) {
        function f1() {
            return wait ?
                setTimeout(() => fn.call(this, ...arg, f), wait) :
                fn.call(this, ...arg, f);
        }

        function f() {
            if (time === 0) return callback && callback.call(this, ...arg);
            if (time === -1) return f1();
            time--;
            return f1();
        }

        return f1();
    };
}

const retryOption = {time: 10};


class Sftp {
    constructor() {
        this.silent = false;
        this.sftp = null;
        this.existDir = {};
    }

    throwError() {
        if (!this.sftp) throw new Error('sftp-server only method');
    }

    /**
     * 回调函数
     * @param resolve
     * @param reject
     * @returns {Function}
     */
    commonCallback(resolve, reject) {
        return err => err ? reject(err) : resolve(true);
    }

    /**
     * 连接服务器
     * @param option
     * @returns {Promise<Sftp>}
     */
    connect(option) {
        return new Promise((resolve, reject) => {
            const connection = new Client();

            connection.on('ready', () => {
                connection.sftp((err, sftp) => {
                    if (err) return reject(err);
                    this.sftp = sftp;
                    resolve(this);
                });
            }).connect(option);
        });
    }

    /**
     * 是否存在
     * resolve|reject(Boolean)
     * @param path
     * @returns {Promise<Boolean>}
     */
    exist(path) {
        this.throwError();
        return new Promise((resolve, reject) => {
            // 查看缓存
            if (this.existDir[path])
                return resolve(true);

            this.sftp.exists(path, b => {
                b && (this.existDir[path] = true);
                resolve(b);
            });
        });
    }

    /**
     * 下载单个文件
     * @param remotePath     远端文件路径
     * @param localPath    存放文件路径
     * @param option        参数
     * @returns {Promise<Boolean>}
     */
    getFile(remotePath, localPath, option) {
        this.throwError();
        return new Promise((resolve, reject) =>
            this.sftp.fastGet(
                remotePath,
                localPath,
                option,
                this.commonCallback(resolve, reject),
            ),
        );
    }

    /**
     * 安全上传文件夹
     * @param pattern   glob表达式
     * @param remote    远端目录
     * @param options   glob配置参数
     * @param putOption fastPut配置参数
     * @returns {Promise<Boolean>}
     */
    upload(pattern, remote, options, putOption) {
        return new Promise((resolve, reject) => {
            const f = (err, paths) => {
                const cwd = process.cwd();
                // 顺序上传文件
                const loop = () => {
                    const item = paths.shift();
                    // 上传了所有文件
                    if (!item) return resolve(true);

                    // 文件磁盘路径
                    const localPath = path.join(cwd, item),
                        remotePath = path.join(remote, item),
                        suc = data => {
                            !this.silent && console.log(chalk.green(`success: ${localPath}  =>  ${remotePath}`));
                            loop();
                        };

                    // 获取文件信息
                    fs.stat(localPath, (err, stat) => {
                        if (err) {
                            !this.silent && console.error(chalk.red(`error: ${localPath}  =>  ${remotePath}`));
                            return loop();
                        }

                        // 上传文件
                        if (stat.isFile()) {
                            return this.put(localPath, remotePath, putOption).then(loop).catch(e => reject(e));
                        }

                        // 上传文件夹
                        if (stat.isDirectory()) {
                            let error = [];
                            return retry(retryOption, again => {
                                this.mkdir(remotePath).then(suc).catch(e => {
                                    error.push(e);
                                    again();
                                });
                            }, () => reject(error))();
                        }
                    });
                };
                loop();
            };
            typeof pattern === 'string' && glob(pattern, options, f);
            Array.isArray(pattern) && f(null, pattern);
        });
    }

    /**
     * 上传单个文件
     * @param localPath     本地文件路径
     * @param remotePath    远端存放路径
     * @param option        参数
     * @returns {Promise<Boolean>}
     */
    putFile(localPath, remotePath, option) {
        this.throwError();
        return new Promise((resolve, reject) =>
            this.sftp.fastPut(
                localPath,
                remotePath,
                option,
                this.commonCallback(resolve, reject),
            ),
        );
    }

    /**
     * 安全上传文件
     * @param localPath
     * @param remotePath
     * @param option
     * @returns {Promise<Boolean>}
     */
    put(localPath, remotePath, option) {
        const p = path.dirname(remotePath), error = [];
        return new Promise((resolve, reject) => {
            this.mkdir(p).then(data => {
                retry(retryOption, next => {
                    this.putFile(localPath, remotePath, option).then(data => {
                        !this.silent &&
                        console.log(chalk.green(`success: ${localPath}  =>  ${remotePath}`));
                        resolve(data);
                    }).catch(e => {
                        error.push(e);
                        next();
                    });
                }, () => reject(error))();
            }).catch(e => reject(e));
        });
    }

    /**
     * 创建单个目录
     * @param dir
     * @returns {Promise<Boolean>}
     * @private
     */
    _mkDir(dir) {
        return new Promise((resolve, reject) => {
            const error = [];
            retry(retryOption, next => {
                this.exist(dir).then(data => {
                    if (data) return resolve(data);
                    this.sftp.mkdir(dir, this.commonCallback(resolve, reject));
                }).catch(e => {
                    error.push(e);
                    next();
                });
            }, () => reject(error))();
        });
    }

    /**
     * 安全创建目录
     * @param path
     * @returns {Promise<Boolean>}
     */
    mkdir(path) {
        this.throwError();
        const paths = path.split(/[\/\\]/).filter(item => !!item);
        let p = '';

        const loop = (resolve, reject) => {
            let item = paths.shift();
            // 创建了每一层目录
            if (!item)
                return resolve(true);

            p += `/${item}`;
            this._mkDir(p)
                .then(data => loop(resolve, reject))
                .catch(e => reject(e));
        };

        return new Promise(loop);
    }
}


module.exports = Sftp;