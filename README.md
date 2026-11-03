# Loon-Plugins

收集与维护个人常用的 Loon 插件与去广告分流规则配置。

---

## 插件列表

### 1. 儿童手表及联盟去广告 (小寻 & 360儿童卫士)

过滤**小寻**（小寻电话手表 App）、**360儿童卫士** App 的开屏广告、自建广告位，以及内嵌的穿山甲、腾讯优量汇、快手联盟、百度百意、贝梓等多家广告联盟 SDK。

#### 订阅链接
* **Loon 插件链接 (GitHub Raw)**：
  ```text
  https://raw.githubusercontent.com/tlsftlsftlsf/Loon-Plugins/main/Plugin/KidsWatch_AdBlock.plugin
  ```
* **国内加速链接 (jsDelivr)**：
  ```text
  https://fastly.jsdelivr.net/gh/tlsftlsftlsf/Loon-Plugins@main/Plugin/KidsWatch_AdBlock.plugin
  ```

#### 安装方式
1. 打开 **Loon** -> 点击底部 **「配置」** -> 选择 **「插件」**；
2. 点击右上角 **「+」** 号；
3. 将上述链接粘贴至 **「URL」** 输入框，点击保存并启用。

---

## 规则分流 (Rule-Set) 列表

如果你希望通过 Loon、Surge 或 Shadowrocket 的规则集形式引用：

* **儿童手表去广告规则集**：
  ```text
  https://raw.githubusercontent.com/tlsftlsftlsf/Loon-Plugins/main/Rule/KidsWatch_AdBlock.list
  ```

---

## 说明
* 针对共享业务接口的域名（如小寻 `xunapi.xunkids.com`），采用精细化的正则路径拦截，不影响手表的定位、通话、健康监测与账号绑定等正常功能。
