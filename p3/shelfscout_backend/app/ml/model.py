from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models


# ============================================================
# CBAM Modules
# ============================================================

class ChannelAttention(nn.Module):
    def __init__(self, c: int, r: int = 16):
        super().__init__()
        mid = max(1, c // r)
        self.mlp = nn.Sequential(
            nn.Conv2d(c, mid, 1, bias=False),
            nn.ReLU(inplace=True),
            nn.Conv2d(mid, c, 1, bias=False),
        )

    def forward(self, x):
        avg = torch.mean(x, dim=(2, 3), keepdim=True)
        mx = torch.amax(x, dim=(2, 3), keepdim=True)
        att = torch.sigmoid(self.mlp(avg) + self.mlp(mx))
        return x * att

class SpatialAttention(nn.Module):
    def __init__(self, k: int = 7):
        super().__init__()
        p = (k - 1) // 2
        self.conv = nn.Conv2d(2, 1, kernel_size=k, padding=p, bias=False)

    def forward(self, x):
        avg = torch.mean(x, dim=1, keepdim=True)
        mx = torch.amax(x, dim=1, keepdim=True)
        att = torch.sigmoid(self.conv(torch.cat([avg, mx], dim=1)))
        return x * att

class CBAM(nn.Module):
    def __init__(self, c: int):
        super().__init__()
        self.ca = ChannelAttention(c)
        self.sa = SpatialAttention()

    def forward(self, x):
        return self.sa(self.ca(x))



# ============================================================
# Backbone + FPN + Model
# ============================================================

class ResNetBackboneCBAM(nn.Module):
    def __init__(self, name="resnet50", pretrained: bool = False):
        super().__init__()

        weights = models.ResNet50_Weights.DEFAULT if pretrained else None
        base = models.resnet50(weights=weights)

        self.conv1 = base.conv1
        self.bn1 = base.bn1
        self.relu = base.relu
        self.maxpool = base.maxpool

        self.layer1 = base.layer1
        self.layer2 = base.layer2
        self.layer3 = base.layer3
        self.layer4 = base.layer4

        self.cbam2 = CBAM(256)
        self.cbam3 = CBAM(512)
        self.cbam4 = CBAM(1024)
        self.cbam5 = CBAM(2048)

        self.out_channels = (256, 512, 1024, 2048)

    def forward(self, x):
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.maxpool(x)

        c2 = self.cbam2(self.layer1(x))
        c3 = self.cbam3(self.layer2(c2))
        c4 = self.cbam4(self.layer3(c3))
        c5 = self.cbam5(self.layer4(c4))

        return {"c2": c2, "c3": c3, "c4": c4, "c5": c5}


class FPN(nn.Module):
    def __init__(self, in_channels, fpn_channels=256):
        super().__init__()
        c2, c3, c4, c5 = in_channels
        self.l2 = nn.Conv2d(c2, fpn_channels, 1)
        self.l3 = nn.Conv2d(c3, fpn_channels, 1)
        self.l4 = nn.Conv2d(c4, fpn_channels, 1)
        self.l5 = nn.Conv2d(c5, fpn_channels, 1)

        self.s2 = nn.Conv2d(fpn_channels, fpn_channels, 3, padding=1)
        self.s3 = nn.Conv2d(fpn_channels, fpn_channels, 3, padding=1)
        self.s4 = nn.Conv2d(fpn_channels, fpn_channels, 3, padding=1)
        self.s5 = nn.Conv2d(fpn_channels, fpn_channels, 3, padding=1)

    def forward(self, feats):
        c2, c3, c4, c5 = feats.values()
        p5 = self.l5(c5)
        p4 = self.l4(c4) + F.interpolate(p5, size=c4.shape[-2:], mode="nearest")
        p3 = self.l3(c3) + F.interpolate(p4, size=c3.shape[-2:], mode="nearest")
        p2 = self.l2(c2) + F.interpolate(p3, size=c2.shape[-2:], mode="nearest")
        return {"p2": self.s2(p2), "p3": self.s3(p3), "p4": self.s4(p4), "p5": self.s5(p5)}

class ConvHead(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_ch, 256, 3, padding=1),
            nn.ReLU(),
            nn.Conv2d(256, out_ch, 1)
        )

    def forward(self, x):
        return self.net(x)

class ShelfScoutPanopticCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.backbone = ResNetBackboneCBAM()
        self.fpn = FPN(self.backbone.out_channels)

        self.sem_head = ConvHead(256, 2)
        self.ctr_head = ConvHead(256, 1)
        self.off_head = ConvHead(256, 2)

    def forward(self, x):
        feats = self.backbone(x)
        p2 = self.fpn(feats)["p2"]
        return self.sem_head(p2), self.ctr_head(p2), self.off_head(p2)



