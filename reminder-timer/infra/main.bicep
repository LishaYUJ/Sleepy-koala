targetScope = 'resourceGroup'

@description('A region supporting Azure Functions Flex Consumption.')
param location string
param functionAppName string = 'koala-reminders-${uniqueString(resourceGroup().id)}'
param apiUrl string = 'https://sleepy-koala-lisa.azurewebsites.net'
@secure()
@minLength(32)
param dispatchKey string

var storageName = 'koalarem${uniqueString(resourceGroup().id)}'
var blobOwnerRole = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}
resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}
resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobs
  name: 'deployments'
  properties: { publicAccess: 'None' }
}
resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${functionAppName}-plan'
  location: location
  kind: 'functionapp'
  sku: { name: 'FC1', tier: 'FlexConsumption' }
  properties: { reserved: true }
}
resource timer 'Microsoft.Web/sites@2024-04-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    functionAppConfig: {
      runtime: { name: 'python', version: '3.12' }
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deploymentContainer.name}'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      scaleAndConcurrency: {
        instanceMemoryMB: 512
        maximumInstanceCount: 40
      }
    }
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' }
        { name: 'REMINDER_API_URL', value: apiUrl }
        { name: 'REMINDER_DISPATCH_KEY', value: dispatchKey }
      ]
    }
  }
}
// The timer uses blob leases for singleton scheduling and its private code package.
resource storageAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, timer.id, blobOwnerRole)
  scope: storage
  properties: {
    principalId: timer.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobOwnerRole)
  }
}

output functionAppName string = timer.name
