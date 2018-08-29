# ruhnn-sftp-cli
- 介绍
- 命令行
- Node接口

## 介绍
封装ssh2提供的sftp相关接口，使用命令行上传文件。

安装方式
```
npm i ruhnn-sftp-cli -g
```

## 命令行
```
sftp-cli
```

## Node接口

### Sftp()
封装ssh2提供的sftp相关接口


#### Sftp.prototype.connect(option) -> Promise<Sftp>
连接sftp服务器
```
{
    "host": "sftp服务器地址",
    "port": "端口",
    "username": "用户",
    "password": "密码"
}
```


#### Sftp.prototype.exist(path) -> Promise<Boolean>
是否存在文件或目录
- path：路径


#### Sftp.prototype.getFile(localPath, remotePath, option) -> Promise<Boolean>
是否存在文件或目录
- localPath: 远端文件路径
- localPath: 存放文件路径
- option: fastGet配置参数 参考 [ssh2-streams](https://github.com/mscdex/ssh2-streams/blob/master/SFTPStream.md)


#### Sftp.prototype.upload(pattern, remote, options, putOption) -> Promise<Boolean>
上传文件夹
- pattern: glob表达式
- remote: 远端目录
- options: glob配置参数
- putOption: fastPut配置参数 参考 [ssh2-streams](https://github.com/mscdex/ssh2-streams/blob/master/SFTPStream.md)


#### Sftp.prototype.put(localPath, remotePath, option) -> Promise<Boolean>
上传文件
- localPath: 本地文件路径
- remotePath: 远端存放路径
- option: fastPut配置参数 参考 [ssh2-streams](https://github.com/mscdex/ssh2-streams/blob/master/SFTPStream.md)


#### Sftp.prototype.mkdir(path) -> Promise<Boolean>
创建目录
- path：目录

