# AAP Test Playbooks

This directory contains playbooks for testing the AAP job template executor.

## Files

- **test-aap-parameters.yml** - Main test playbook demonstrating all AAP parameters
- **inventory.ini** - Sample inventory file for local testing

## Local Testing

### Option 1: Test on localhost (Recommended for quick testing)

```bash
# Run on localhost with all tasks
ansible-playbook samples/playbooks/test-aap-parameters.yml -i samples/playbooks/inventory.ini

# Run with specific tags
ansible-playbook samples/playbooks/test-aap-parameters.yml -i samples/playbooks/inventory.ini --tags monitoring

# Run with extra variables
ansible-playbook samples/playbooks/test-aap-parameters.yml -i samples/playbooks/inventory.ini \
  -e "app_name=myapp app_version=2.0.0 deployment_env=production operation=deploy"

# Run with verbosity
ansible-playbook samples/playbooks/test-aap-parameters.yml -i samples/playbooks/inventory.ini -vvv

# Skip certain tasks
ansible-playbook samples/playbooks/test-aap-parameters.yml -i samples/playbooks/inventory.ini --skip-tags deploy,backup
```

### Option 2: Test without inventory file (localhost only)

```bash
# Specify localhost directly
ansible-playbook samples/playbooks/test-aap-parameters.yml -i localhost, --connection=local

# With comma after localhost - this tells Ansible to use localhost as inventory
```

### Option 3: Create custom inventory

Edit `inventory.ini` to add your actual hosts:

```ini
[webservers]
web-01.example.com
web-02.example.com

[webservers:vars]
ansible_user=deploy
ansible_python_interpreter=/usr/bin/python3
```

Then run:
```bash
ansible-playbook samples/playbooks/test-aap-parameters.yml -i samples/playbooks/inventory.ini --limit webservers
```

## Testing Scenarios

### 1. Basic execution on localhost
```bash
ansible-playbook samples/playbooks/test-aap-parameters.yml -i samples/playbooks/inventory.ini
```

### 2. Monitoring tasks only
```bash
ansible-playbook samples/playbooks/test-aap-parameters.yml -i samples/playbooks/inventory.ini --tags monitoring
```
Expected output: Disk usage, memory usage, health check

### 3. System info only
```bash
ansible-playbook samples/playbooks/test-aap-parameters.yml -i samples/playbooks/inventory.ini --tags system
```
Expected output: OS details, distribution, architecture

### 4. Skip deployment tasks
```bash
ansible-playbook samples/playbooks/test-aap-parameters.yml -i samples/playbooks/inventory.ini --skip-tags deploy
```

### 5. With custom variables
```bash
ansible-playbook samples/playbooks/test-aap-parameters.yml -i samples/playbooks/inventory.ini \
  -e "app_name=production-app app_version=3.2.1 deployment_env=production operation=deploy custom_message='Deploying to prod!'"
```

### 6. High verbosity (debugging)
```bash
ansible-playbook samples/playbooks/test-aap-parameters.yml -i samples/playbooks/inventory.ini -vvv
```
Verbosity levels:
- `-v` - verbose
- `-vv` - more verbose
- `-vvv` - debug level
- `-vvvv` - connection debugging

### 7. Verify credentials
```bash
# Show which user/credential is being used
ansible-playbook samples/playbooks/test-aap-parameters.yml -i samples/playbooks/inventory.ini --tags credentials
```

### 8. Check mode (dry run)
```bash
ansible-playbook samples/playbooks/test-aap-parameters.yml -i samples/playbooks/inventory.ini --check
```

## Expected Output

When running successfully, you should see:

```
PLAY [AAP Parameter Testing Playbook] ******************************************

TASK [Gathering Facts] *********************************************************
ok: [localhost]

TASK [Display playbook execution info] *****************************************
ok: [localhost] => {
    "msg": [
        "=== AAP Job Template Test Execution ===",
        "Application: test-app",
        "Version: 1.0.0",
        ...
    ]
}

TASK [Gather system information] ***********************************************
ok: [localhost] => {
    "msg": [
        "OS Family: Darwin",
        "Distribution: MacOSX 14.0",
        ...
    ]
}

...

PLAY RECAP *********************************************************************
localhost                  : ok=10   changed=0   unreachable=0   failed=0   skipped=0   rescued=0   ignored=0
```
