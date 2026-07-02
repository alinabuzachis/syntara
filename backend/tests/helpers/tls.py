"""TLS certificate generation helpers for tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path


def generate_ca(certs_dir: Path) -> tuple[rsa.RSAPrivateKey, x509.Certificate]:
    """Generate a self-signed CA certificate and write it to *certs_dir*."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Test CA")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(UTC))
        .not_valid_after(datetime.now(UTC) + timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .add_extension(
            x509.KeyUsage(
                digital_signature=False,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=True,
                crl_sign=True,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .sign(key, hashes.SHA256())
    )
    (certs_dir / "ca.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    (certs_dir / "ca.key").write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()
        )
    )
    return key, cert


def generate_self_signed_cert(certs_dir: Path, common_name: str, filename: str) -> tuple[Path, Path]:
    """Generate a self-signed certificate and key (for client cert or simple CA tests)."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name)])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(UTC))
        .not_valid_after(datetime.now(UTC) + timedelta(days=1))
        .sign(key, hashes.SHA256())
    )
    cert_path = certs_dir / f"{filename}.pem"
    key_path = certs_dir / f"{filename}.key"
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()
        )
    )
    return cert_path, key_path


def generate_server_cert(
    certs_dir: Path,
    ca_key: rsa.RSAPrivateKey,
    ca_cert: x509.Certificate,
) -> None:
    """Generate a server certificate signed by *ca_key*/*ca_cert* with localhost SAN."""
    from ipaddress import IPv4Address

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(ca_cert.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(UTC))
        .not_valid_after(datetime.now(UTC) + timedelta(days=1))
        .add_extension(
            x509.SubjectAlternativeName([x509.DNSName("localhost"), x509.IPAddress(IPv4Address("127.0.0.1"))]),
            critical=False,
        )
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
        .sign(ca_key, hashes.SHA256())
    )
    (certs_dir / "server.crt").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    server_key_path = certs_dir / "server.key"
    server_key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()
        )
    )


def generate_service_cert(
    certs_dir: Path,
    ca_key: rsa.RSAPrivateKey,
    ca_cert: x509.Certificate,
    common_name: str = "backend.nexus.svc",
    filename: str = "service",
) -> tuple[Path, Path]:
    """Generate a CA-signed certificate with both serverAuth and clientAuth EKUs.

    Used for mTLS testing where the same certificate serves as both the
    server cert (uvicorn) and the client cert (outbound httpx calls).
    """
    from ipaddress import IPv4Address

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name)])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(ca_cert.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(UTC))
        .not_valid_after(datetime.now(UTC) + timedelta(days=1))
        .add_extension(
            x509.SubjectAlternativeName([x509.DNSName("localhost"), x509.IPAddress(IPv4Address("127.0.0.1"))]),
            critical=False,
        )
        .add_extension(
            x509.ExtendedKeyUsage(
                [
                    x509.oid.ExtendedKeyUsageOID.SERVER_AUTH,
                    x509.oid.ExtendedKeyUsageOID.CLIENT_AUTH,
                ]
            ),
            critical=False,
        )
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
        .sign(ca_key, hashes.SHA256())
    )
    cert_path = certs_dir / f"{filename}.crt"
    key_path = certs_dir / f"{filename}.key"
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()
        )
    )
    return cert_path, key_path


def generate_crl(
    certs_dir: Path,
    ca_key: rsa.RSAPrivateKey,
    ca_cert: x509.Certificate,
    revoked_certs: Sequence[x509.Certificate] | None = None,
) -> Path:
    """Generate a PEM-encoded CRL signed by *ca_key*/*ca_cert*.

    Each certificate in *revoked_certs* is added as a revoked entry.
    Returns the path to the written CRL file.
    """
    builder = (
        x509.CertificateRevocationListBuilder()
        .issuer_name(ca_cert.subject)
        .last_update(datetime.now(UTC))
        .next_update(datetime.now(UTC) + timedelta(days=1))
    )
    for cert in revoked_certs or ():
        builder = builder.add_revoked_certificate(
            x509.RevokedCertificateBuilder()
            .serial_number(cert.serial_number)
            .revocation_date(datetime.now(UTC))
            .build()
        )
    crl = builder.sign(ca_key, hashes.SHA256())
    crl_path = certs_dir / "crl.pem"
    crl_path.write_bytes(crl.public_bytes(serialization.Encoding.PEM))
    return crl_path
