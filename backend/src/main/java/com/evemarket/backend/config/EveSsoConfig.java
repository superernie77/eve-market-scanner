package com.evemarket.backend.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "eve.sso")
public class EveSsoConfig {
    private String clientId;
    private String clientSecret;
    private String redirectUri;
}
