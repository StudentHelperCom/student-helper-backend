.PHONY: help dcbb dcbu dcbd dcfu dcfd dcau dcad dcbp

dcbb:
	docker-compose --profile backend build

dcbu:
	docker-compose --profile backend up -d

dcbd:
	docker-compose --profile backend down

dcfu:
	docker-compose --profile frontend up -d

dcfd:
	docker-compose --profile frontend down

dcau:
	docker-compose --profile all up -d

dcad:
	docker-compose --profile all down

dcbp:
	docker-compose --profile backend push